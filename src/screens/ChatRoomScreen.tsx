import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, setDoc, updateDoc, increment, writeBatch, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { formatTime12h } from '../lib/timeUtils';
import { useAuth } from '../hooks/useAuth';
import { ChatMessage } from '../types';

export default function ChatRoomScreen() {
  const { chatId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [recipient, setRecipient] = useState<{name: string, title: string, photo: string, id: string} | null>(null);
  const [sending, setSending] = useState(false);
  const resetUnreadDone = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (authLoading || !chatId || !user) return;

    // Reset unread count for current user - only once per mount
    const resetUnread = async () => {
      if (resetUnreadDone.current) return;
      try {
        const roomRef = doc(db, 'chats', chatId);
        const roomSnap = await getDoc(roomRef);
        if (roomSnap.exists()) {
          const data = roomSnap.data();
          if (data.unreadCount && data.unreadCount[user.uid] > 0) {
            await updateDoc(roomRef, {
              [`unreadCount.${user.uid}`]: 0
            });
            resetUnreadDone.current = true;
          }
        }
      } catch (e: any) {
        if (e?.code === 'resource-exhausted') {
          console.warn('Quota exceeded, skipping unread reset');
          resetUnreadDone.current = true; // Don't keep trying if quota is hit
          return;
        }
        console.warn('Failed to reset unread count', e);
      }
    };
    resetUnread();

    // Fetch recipient info
    const fetchRecipient = async () => {
      try {
        let otherId = chatId.split('_').find(p => p !== user.uid);
        
        // If employee is trying to reach their manager
        if (otherId === 'manager-id' && user.role === 'employee' && user.groupId) {
          const groupSnap = await getDoc(doc(db, 'groups', user.groupId));
          if (groupSnap.exists()) {
            otherId = groupSnap.data().managerId;
          }
        }

        if (!otherId) return;

        const userSnap = await getDoc(doc(db, 'users', otherId));
        if (userSnap.exists()) {
          const u = userSnap.data();
          setRecipient({
            id: otherId,
            name: u.displayName || u.name || 'زميل',
            title: u.jobTitle || (u.role === 'manager' ? 'مدير' : 'موظف'),
            photo: u.profileImageUrl || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=100&h=100"
          });
        }
      } catch (e) {
        console.error('Error fetching recipient:', e);
      }
    };

    fetchRecipient();

    // Ensure room exists
    const ensureRoom = async () => {
      try {
        const roomRef = doc(db, 'chats', chatId);
        const roomSnap = await getDoc(roomRef);
        if (!roomSnap.exists()) {
          const parts = chatId.split('_');
          let pIds = parts.length === 2 && !parts.includes('manager-id') ? parts : [user.uid];
          
          if (pIds.length === 1) {
            // Find the other person
            let otherId = parts.find(p => p !== user.uid);
            if (otherId === 'manager-id' && user.groupId) {
              const groupSnap = await getDoc(doc(db, 'groups', user.groupId));
              if (groupSnap.exists()) otherId = groupSnap.data().managerId;
            }
            if (otherId) pIds.push(otherId);
          }

          await setDoc(roomRef, {
            participants: pIds,
            lastMessage: 'بدء المحادثة',
            lastUpdate: serverTimestamp(),
            unreadCount: pIds.reduce((acc, id) => ({ ...acc, [id]: 0 }), {})
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `chats/${chatId}`);
      }
    };

    ensureRoom();

    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
      setMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `chats/${chatId}/messages`);
    });

    return () => unsubscribe();
  }, [chatId, user, authLoading]);

  // Scroll to bottom helper (though flex-col-reverse handles most of it)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages]);

  const sendMessage = async (imageUrl?: string) => {
    // Basic validation: must have text or image
    if ((!text.trim() && !imageUrl) || !chatId || !user) return;
    
    // Block multiple clicks for text messages
    if (!imageUrl && sending) return;
    
    const currentText = text;
    
    // For text messages, clear input and show sending state immediately
    if (!imageUrl) {
      setSending(true);
      setText('');
    }

    try {
      // 1. Prepare message data
      const messageData = {
        chatId,
        senderId: user.uid,
        senderName: user.displayName || 'زميل',
        text: currentText,
        imageUrl: imageUrl || null,
        type: imageUrl ? 'image' : 'text',
        timestamp: serverTimestamp()
      };

      // 2. Add to messages collection
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      await addDoc(messagesRef, messageData);

      // 3. Update the main chat room document for the list view
      const currentRecipientId = recipient?.id || chatId.split('_').find(id => id !== user.uid);
      const roomRef = doc(db, 'chats', chatId);
      
      await setDoc(roomRef, {
        lastMessage: imageUrl ? 'صورة 📷' : currentText,
        lastUpdate: serverTimestamp(),
        lastSenderId: user.uid,
        [`unreadCount.${currentRecipientId}`]: increment(1)
      }, { merge: true });

      // If we sent an image with text, clear text now
      if (imageUrl) setText('');
      
    } catch (err) {
      console.error('CRITICAL: Failed to send message:', err);
      handleFirestoreError(err, OperationType.CREATE, `chats/${chatId}/messages`);
      // Restore text if it failed
      if (!imageUrl) setText(currentText);
      alert('عذراً، فشل إرسال الرسالة. يرجى المحاولة مرة أخرى.');
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !chatId || !user) return;

    // Use a temporary uploading state
    setSending(true);
    
    try {
      console.log('Starting file upload:', file.name, file.size);
      const path = `chats/${chatId}/${Date.now()}_${file.name}`;
      const fileRef = ref(storage, path);
      
      // Explicitly set content type to help storage rules and preview
      const metadata = { contentType: file.type };
      
      const uploadResult = await uploadBytes(fileRef, file, metadata);
      const url = await getDownloadURL(uploadResult.ref);
      
      console.log('File uploaded successfully, URL:', url);
      
      // Send the message with the image URL
      await sendMessage(url);
      
      // Reset the file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error('CRITICAL: Upload flow failed:', err);
      alert('فشل رفع الصورة. تأكد من جودة الاتصال بالإنترنت وحاول مرة أخرى.');
    } finally {
      setSending(false);
    }
  };

  const handleClearChat = async () => {
    if (!chatId || !user) return;
    if (!window.confirm('هل أنت متأكد من حذف جميع الرسائل في هذه المحادثة؟ لا يمكن التراجع عن هذا الإجراء.')) return;

    try {
      setSending(true);
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      const snapshot = await getDocs(messagesRef);
      
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();

      // Update the main chat room document
      const roomRef = doc(db, 'chats', chatId);
      await updateDoc(roomRef, {
        lastMessage: 'تم مسح المحادثة',
        lastUpdate: serverTimestamp(),
        [`unreadCount.${user.uid}`]: 0
      });

      alert('تم حذف جميع الرسائل بنجاح.');
    } catch (err) {
      console.error('Error clearing chat:', err);
      alert('فشل حذف الرسائل. يرجى المحاولة مرة أخرى.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white text-slate-800 h-screen flex flex-col">
      <div className="w-full bg-white h-screen relative flex flex-col shadow-sm overflow-hidden">
        <header className="shrink-0 flex items-center justify-between px-8 py-6 bg-white border-b border-slate-100 z-50 sticky top-0">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-xl border border-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-50 transition-colors">
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
          <div className="flex flex-col items-center flex-1">
            <h1 className="text-lg md:text-xl font-black text-slate-900  ">
              {recipient?.name || 'محادثة'}
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-[10px] font-bold text-slate-400 uppercase  ">متصل الآن</span>
            </div>
          </div>
          <button 
            onClick={handleClearChat}
            className="w-10 h-10 rounded-xl border border-slate-100 flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all"
            title="مسح المحادثة"
          >
            <span className="material-symbols-outlined">delete_sweep</span>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-8 flex flex-col-reverse gap-6 scroll-smooth bg-[#fcfcfd] relative">
          {/* Subtle background accent */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[radial-gradient(#E31E24_1px,transparent_1px)] [background-size:20px_20px]"></div>
          
          <div ref={scrollRef} className="h-2 w-full shrink-0" />
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4 opacity-60">
              <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-4xl">chat_bubble</span>
              </div>
              <p className="text-sm font-bold">لا توجد رسائل بعد</p>
              <p className="text-[10px] uppercase tracking-widest font-black">ابدأ المحادثة الآن</p>
            </div>
          ) : messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col gap-2 max-w-[85%] ${msg.senderId === user?.uid ? 'self-start items-start' : 'self-end items-end'}`}>
              <div className={`p-4 md:p-5 rounded-[24px] shadow-sm text-sm font-medium leading-relaxed text-right transition-all ${msg.senderId === user?.uid ? 'bg-[#E31E24] text-white rounded-tr-none shadow-red-100' : 'bg-white text-slate-700 rounded-tl-none border border-slate-100 shadow-slate-100'}`}>
                {msg.imageUrl && (
                  <div className="mb-2 overflow-hidden rounded-xl">
                    <img 
                      src={msg.imageUrl} 
                      alt="Uploaded" 
                      className="max-w-full h-auto object-cover cursor-pointer hover:scale-105 transition-transform" 
                      onClick={() => window.open(msg.imageUrl)} 
                    />
                  </div>
                )}
                {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
              </div>
              <div className={`flex items-center gap-2 px-1 ${msg.senderId === user?.uid ? 'flex-row' : 'flex-row-reverse'}`}>
                <span className="text-[9px] font-black text-slate-300 uppercase  ">
                  {msg.timestamp?.toDate ? 
                    formatTime12h(msg.timestamp.toDate()) : 
                    formatTime12h(new Date())
                  }
                </span>
                {msg.senderId === user?.uid && (
                  <span className="material-symbols-outlined text-[14px] text-[#E31E24] font-black">done_all</span>
                )}
              </div>
            </div>
          ))}
        </main>

        <div className="shrink-0 bg-white border-t border-slate-100 p-6">
          <div className="flex items-center gap-4">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileUpload} 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-100 transition-all shadow-sm border border-slate-100 disabled:opacity-50"
            >
              <span className="material-symbols-outlined">attach_file</span>
            </button>
            <div className="flex-1 relative">
              <input 
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold text-slate-800 focus:outline-none focus:border-[#E31E24] focus:bg-white transition-all text-right shadow-inner" 
                placeholder={sending ? "جاري الإرسال..." : "اكتب رسالتك هنا..."} 
                type="text" 
                value={text}
                disabled={sending}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              />
            </div>
            <button 
              onClick={() => sendMessage()} 
              disabled={sending || !text.trim()}
              className="w-12 h-12 bg-[#E31E24] text-white rounded-2xl flex items-center justify-center hover:bg-red-700 transition-all shadow-lg shadow-red-100 active:scale-90 disabled:opacity-50"
            >
              <span className="material-symbols-outlined filled-icon">send</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
