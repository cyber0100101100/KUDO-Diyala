import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ChatRoom } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { formatTime12h } from '../lib/timeUtils';
import { useAuth } from '../hooks/useAuth';

interface ChatRoomItemProps {
  room: ChatRoom;
  userId: string;
  userRole: string;
}

const ChatRoomItem: React.FC<ChatRoomItemProps> = ({ room, userId, userRole }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [otherUser, setOtherUser] = useState<{name: string, title: string, photo: string} | null>(null);

  const [showOptions, setShowOptions] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isManagement = userRole === 'admin' || userRole === 'manager';

  useEffect(() => {
    const otherId = room.participants.find(p => p !== userId);
    if (!otherId) return;

    const fetchUser = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', otherId));
        if (snap.exists()) {
          const data = snap.data();
          setOtherUser({
            name: data.displayName || data.name || 'زميل',
            title: data.jobTitle || (data.role === 'manager' ? 'مدير' : 'موظف'),
            photo: data.profileImageUrl || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=100&h=100"
          });
        } else if (otherId === 'manager-id') {
          setOtherUser({
            name: 'أحمد المدير',
            title: 'مدير العمليات',
            photo: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBrx6_YgVbgBetk0oZ6llBYzVNK4VTOfHOwXfEymGwa_8klRJ1KuvX7K7GXmjsSKxNQGF9fLUtibemNgKJxYLeOq4OiNqFLJ5zN5yVcr86ResMsVKVB9-DRtVjWHcL9CbFNGhjn1j6JIprMML3ss3CcAk2NnO22w2TkoZ3J28ZUx6wLNOZkGl_5BIVslf5NDdLytsf0ushIoqc48Q_RVC0ElsGTaD2xANUL81Bf0ntFoDx2eBYX5UDfPA'
          });
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchUser();
  }, [room, userId]);

  const timeStr = room.lastUpdate ? formatTime12h(new Date(room.lastUpdate.seconds * 1000)) : '';

  const basePath = isManagement ? 'admin' : 'employee';

  const [showConfirm, setShowConfirm] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      // 1. Delete all messages in the room
      const messagesRef = collection(db, 'chats', room.id, 'messages');
      const messagesSnap = await getDocs(messagesRef);
      const deletePromises = messagesSnap.docs.map(d => deleteDoc(d.ref));
      await Promise.all(deletePromises);

      // 2. Delete the chat room document
      await deleteDoc(doc(db, 'chats', room.id));
    } catch (error) {
      console.error("Error deleting chat:", error);
      alert('عذراً، حدث خطأ أثناء حذف المحادثة');
    } finally {
      setIsDeleting(false);
      setShowConfirm(false);
      setShowOptions(false);
    }
  };

  return (
    <div className="relative w-full group">
      <button 
        onClick={() => navigate(`/${basePath}/chat/${room.id}`)}
        className={`bg-white rounded-[32px] p-6 shadow-sm flex items-center justify-between border border-slate-100 hover:bg-slate-50 transition-all text-right w-full ${isDeleting ? 'opacity-50 pointer-events-none animate-pulse' : ''}`}
      >
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-shrink-0">
            <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-slate-100 shadow-sm">
              <img alt="" className="w-full h-full object-cover" src={otherUser?.photo || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=100&h=100"} />
            </div>
            <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow-sm"></span>
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <h3 className="text-lg font-bold text-slate-800 group-hover:text-[#E31E24] transition-colors">{otherUser?.name || '...'}</h3>
            <p className="text-xs text-slate-400 font-bold mb-1">{otherUser?.title || '...'}</p>
            <p className="text-sm text-slate-500 font-medium truncate">{room.lastMessage}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 pr-4">
          <span className="text-[10px] font-bold text-slate-400">{timeStr}</span>
          {room.unreadCount && room.unreadCount[userId] > 0 && (
            <span className="flex items-center justify-center w-6 h-6 bg-[#E31E24] text-white rounded-xl text-[10px] font-bold shadow-lg shadow-red-100 animate-in zoom-in duration-300">
              {room.unreadCount[userId]}
            </span>
          )}
        </div>
      </button>

      <div className="absolute top-4 left-4 z-10">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setShowOptions(!showOptions);
          }}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
        >
          <span className="material-symbols-outlined text-xl">more_vert</span>
        </button>

        <AnimatePresence>
          {showOptions && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowOptions(false);
                }}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                className="absolute left-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 z-20 py-2"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowConfirm(true);
                    setShowOptions(false);
                  }}
                  className="w-full px-4 py-3 text-right flex items-center gap-3 text-red-600 hover:bg-red-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-xl">delete</span>
                  <span className="text-sm font-bold">حذف المحادثة</span>
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Custom Confirmation Modal */}
      <AnimatePresence>
        {showConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-xs rounded-[32px] p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-[#E31E24] rounded-2xl flex items-center justify-center mx-auto mb-6">
                <span className="material-symbols-outlined text-3xl">delete_forever</span>
              </div>
              <h3 className="text-lg font-black text-slate-900 mb-2">حذف المحادثة؟</h3>
              <p className="text-sm font-bold text-slate-400 mb-8 leading-relaxed">
                سيتم حذف جميع الرسائل بشكل نهائي من الطرفين. هل أنت متأكد؟
              </p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="w-full py-4 bg-red-500 text-white rounded-2xl text-sm font-black shadow-lg shadow-red-100 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isDeleting ? 'جاري الحذف...' : 'نعم، احذف الآن'}
                </button>
                <button 
                  onClick={() => setShowConfirm(false)}
                  disabled={isDeleting}
                  className="w-full py-4 bg-slate-100 text-slate-400 rounded-2xl text-sm font-black active:scale-95 transition-all disabled:opacity-50"
                >
                  تراجع
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChatRoomItem;
