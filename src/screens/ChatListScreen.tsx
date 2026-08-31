import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { ChatRoom, User } from '../types';
import ChatRoomItem from '../components/ChatRoomItem';

export default function ChatListScreen() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) return;
    
    // In this app, employee usually chats with manager
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('lastUpdate', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRooms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatRoom)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'chats');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, authLoading]);

  const startChat = async (targetId: string = 'manager-id') => {
    const isManagement = user?.role === 'admin' || user?.role === 'manager';
    const basePath = isManagement ? 'admin' : 'employee';
    const chatId = [user!.uid, targetId].sort().join('_');
    navigate(`/${basePath}/chat/${chatId}`);
  };

  return (
    <div className="bg-white text-slate-800 min-h-screen flex flex-col">
      <div className="w-full bg-white min-h-screen relative flex flex-col shadow-sm">
        <header className="flex items-center justify-between px-8 py-6 bg-white border-b border-slate-100 z-10 sticky top-0">
          <button className="w-10 h-10 rounded-xl border border-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-50 transition-colors">
            <span className="material-symbols-outlined">more_horiz</span>
          </button>
          <h1 className="text-xl font-bold text-slate-800">الرسائل</h1>
          <button onClick={() => startChat()} className="w-10 h-10 rounded-xl bg-red-50 text-[#E31E24] flex items-center justify-center shadow-sm border border-red-100 hover:bg-red-100 transition-colors">
            <span className="material-symbols-outlined filled-icon">add</span>
          </button>
        </header>

        <main className="flex-1 px-8 py-8 pb-32 flex flex-col gap-6">
          <div className="relative">
            <input 
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pr-12 pl-6 text-sm font-bold text-slate-800 focus:outline-none focus:border-[#E31E24] focus:bg-white transition-all text-right shadow-sm" 
              placeholder="بحث عن زميل..." 
              type="text" 
            />
            <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-300">search</span>
          </div>

          <div className="flex flex-col gap-4">
            {rooms.map((room: any) => (
              <ChatRoomItem 
                key={room.id} 
                room={room} 
                userId={user!.uid} 
                userRole={user!.role || 'employee'} 
              />
            ))}

            {rooms.length === 0 && !loading && (
              <div className="py-20 text-center text-slate-300 font-bold flex flex-col items-center gap-4">
                <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center border border-slate-100">
                  <span className="material-symbols-outlined text-4xl">forum</span>
                </div>
                ابدأ محادثة جديدة الآن
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
