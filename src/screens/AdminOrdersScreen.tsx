import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Order } from '../types';
import { useAuth } from '../hooks/useAuth';

import AdminTopHeader from '../components/AdminTopHeader';

export default function AdminOrdersScreen() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'preparing' | 'ready'>('all');

  useEffect(() => {
    if (authLoading || !user) return;

    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      setOrders(fetchedOrders);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'orders');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, authLoading]);

  const filteredOrders = orders.filter(order => {
    if (activeTab === 'all') return true;
    return order.status === activeTab;
  });

  const updateOrderStatus = async (orderId: string, newStatus: Order['status']) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, { status: newStatus });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'preparing': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'ready': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'delivered': return 'bg-slate-100 text-slate-500 border-slate-200';
      case 'cancelled': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusLabel = (status: Order['status']) => {
    switch (status) {
      case 'pending': return 'قيد الانتظار';
      case 'preparing': return 'جاري التحضير';
      case 'ready': return 'جاهز للاستلام';
      case 'delivered': return 'تم التسليم';
      case 'cancelled': return 'ملغي';
      default: return status;
    }
  };

  return (
    <div className="font-sans rtl flex flex-col min-h-screen bg-slate-50 antialiased pb-24">
      <AdminTopHeader showBackButton />

      {/* Tabs */}
      <div className="px-6 py-4 bg-white border-b border-slate-100">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {(['all', 'pending', 'preparing', 'ready'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2.5 rounded-full text-xs font-black whitespace-nowrap transition-all active:scale-95 border ${
                activeTab === tab 
                ? 'bg-[#E31E24] text-white border-[#E31E24] shadow-lg shadow-red-100' 
                : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100'
              }`}
            >
              {tab === 'all' ? 'الكل' : getStatusLabel(tab)}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Grid */}
      <main className="flex-1 p-6 flex flex-col gap-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-bold text-slate-400">جاري تحميل الطلبات...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-20 h-20 bg-slate-100 rounded-[32px] flex items-center justify-center text-slate-300">
              <span className="material-symbols-outlined text-4xl">inventory_2</span>
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">لا توجد طلبات</h3>
              <p className="text-xs font-bold text-slate-400">الطلبات الجديدة ستظهر هنا تلقائياً</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredOrders.map((order) => (
                <motion.div
                  layout
                  key={order.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden flex flex-col"
                >
                  {/* Order Header */}
                  <div className="p-4 border-b border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-[#E31E24] font-black text-sm">
                        #{order.orderNumber}
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900">{order.customerName}</h4>
                        <span className="text-[10px] font-bold text-slate-400">{order.type === 'dine-in' ? `طاولة ${order.tableNumber}` : order.type}</span>
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-[10px] font-black border ${getStatusColor(order.status)}`}>
                      {getStatusLabel(order.status)}
                    </div>
                  </div>

                  {/* Order Items */}
                  <div className="p-4 flex-1">
                    <div className="space-y-3">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900">{item.quantity}x</span>
                            <span className="text-xs font-bold text-slate-600">{item.name}</span>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400">{Math.trunc(item.price * item.quantity).toLocaleString()} د.ع</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Order Footer */}
                  <div className="p-4 bg-slate-50/50 border-t border-slate-50 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block">الإجمالي</span>
                      <span className="text-sm font-black text-slate-900">{Math.trunc(order.total).toLocaleString()} د.ع</span>
                    </div>
                    <div className="flex gap-2">
                      {order.status === 'pending' && (
                        <button 
                          onClick={() => updateOrderStatus(order.id!, 'preparing')}
                          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black shadow-lg shadow-blue-100 active:scale-95 transition-transform"
                        >
                          بدء التحضير
                        </button>
                      )}
                      {order.status === 'preparing' && (
                        <button 
                          onClick={() => updateOrderStatus(order.id!, 'ready')}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black shadow-lg shadow-emerald-100 active:scale-95 transition-transform"
                        >
                          جاهز
                        </button>
                      )}
                      {order.status === 'ready' && (
                        <button 
                          onClick={() => updateOrderStatus(order.id!, 'delivered')}
                          className="px-4 py-2 bg-[#E31E24] text-white rounded-xl text-[10px] font-black shadow-lg shadow-red-100 active:scale-95 transition-transform"
                        >
                          تسليم
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}
