'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Send, LogOut, MessageSquare, Plus, UserCircle2 } from 'lucide-react';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin h-8 w-8 rounded-full border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!session) {
    return <AuthUI />;
  }

  return <ChatUI session={session} />;
}

function AuthUI() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isLogin, setIsLogin] = useState(true);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setError('Success! Check your email or try logging in.'); 
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="max-w-md w-full p-8 bg-white rounded-xl shadow-lg border border-gray-100">
        <div className="flex justify-center mb-8">
          <div className="bg-indigo-100 p-3 rounded-full">
            <MessageSquare className="w-8 h-8 text-indigo-600" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">
          Secure Message System
        </h2>
        
        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              required
            />
          </div>
          
          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg hover:bg-indigo-700 font-medium transition disabled:opacity-50"
          >
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          {isLogin ? 'Need an account?' : 'Already have an account?'}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="ml-1 text-indigo-600 hover:underline font-medium"
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  );
}

function ChatUI({ session }: { session: any }) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConv, setActiveConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [creatingConv, setCreatingConv] = useState(false);
  const [newContactEmail, setNewContactEmail] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentUserId = session.user.id;

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (!activeConv) return;
    fetchMessages(activeConv.id);

    const channel = supabase
      .channel(`messages:${activeConv.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeConv.id}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
          scrollToBottom();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConv]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const fetchConversations = async () => {
    const { data, error } = await supabase
      .from('conversations')
      .select(`
        id,
        participant1_id,
        participant2_id,
        participant1:profiles!participant1_id(email),
        participant2:profiles!participant2_id(email)
      `)
      .or(`participant1_id.eq.${currentUserId},participant2_id.eq.${currentUserId}`)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const formatted = data.map((c: any) => ({
        ...c,
        contact_email: c.participant1_id === currentUserId ? c.participant2.email : c.participant1.email
      }));
      setConversations(formatted);
    }
  };

  const fetchMessages = async (convId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    
    if (data) {
      setMessages(data);
      scrollToBottom();
    }
  };

  const startConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactEmail.trim()) return;

    try {
      const { data: profiles, error: profileErr } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', newContactEmail.trim())
        .single();
        
      if (profileErr || !profiles) {
        alert("User not found.");
        return;
      }

      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .insert({
          participant1_id: currentUserId,
          participant2_id: profiles.id
        })
        .select()
        .single();

      if (convErr) throw convErr;

      setCreatingConv(false);
      setNewContactEmail('');
      await fetchConversations();
      
      const newActive = { ...conv, contact_email: profiles.email };
      setActiveConv(newActive);

    } catch (err: any) {
      alert("Error starting conversation: " + err.message);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeConv) return;

    const content = newMessage.trim();
    setNewMessage(''); 
    
    const { error } = await supabase
      .from('messages')
      .insert({
        conversation_id: activeConv.id,
        sender_id: currentUserId,
        content: content
      });

    if (error) {
      alert("Failed to send: " + error.message);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans text-gray-900">
      
      {/* SIDEBAR */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col z-10 shadow-sm relative">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-sm text-gray-800">Messages</span>
            <span className="text-xs text-gray-500 truncate mt-0.5">{session.user.email}</span>
          </div>
          <button 
            onClick={() => supabase.auth.signOut()} 
            className="p-2 ml-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors flex-shrink-0"
            title="Sign Out"
          >
            <LogOut size={16} />
          </button>
        </div>

        <div className="p-3 border-b border-gray-100 flex-shrink-0">
          {!creatingConv ? (
            <button 
              onClick={() => setCreatingConv(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition text-sm font-medium"
            >
              <Plus size={16} /> New Chat
            </button>
          ) : (
            <form onSubmit={startConversation} className="flex gap-2">
              <input 
                type="email"
                placeholder="User's email..."
                value={newContactEmail}
                onChange={e => setNewContactEmail(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                autoFocus
              />
              <button type="submit" className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium flex-shrink-0">Add</button>
              <button type="button" onClick={() => setCreatingConv(false)} className="px-2 text-gray-400 hover:text-gray-600 text-sm flex-shrink-0">✖</button>
            </form>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-400 mt-10">
              No conversations yet.
            </div>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => setActiveConv(conv)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 transition ${
                  activeConv?.id === conv.id ? 'bg-indigo-50/70 border-l-4 border-l-indigo-600' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`flex-shrink-0 p-1.5 rounded-full ${activeConv?.id === conv.id ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                    <UserCircle2 size={24} strokeWidth={1.5} />
                  </div>
                  <div className="truncate flex-1">
                    <p className={`text-sm truncate ${activeConv?.id === conv.id ? 'font-semibold text-indigo-900' : 'font-medium text-gray-700'}`}>
                      {conv.contact_email}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* MAIN CHAT AREA */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#f9fafb]">
        {activeConv ? (
          <>
            <div className="h-16 px-6 border-b border-gray-200 bg-white flex items-center shadow-sm z-0 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-full flex-shrink-0">
                  <UserCircle2 size={24} strokeWidth={1.5} />
                </div>
                <h3 className="font-semibold text-gray-900 text-base truncate">{activeConv.contact_email}</h3>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
              {messages.map((msg, idx) => {
                const isMe = msg.sender_id === currentUserId;
                return (
                  <div key={msg.id || idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl ${
                      isMe 
                        ? 'bg-indigo-600 text-white rounded-br-none shadow-sm' 
                        : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none shadow-sm'
                    }`}>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap word-break-words break-words">{msg.content}</p>
                      <span className={`text-[10px] mt-1 block h-fit ${isMe ? 'text-indigo-200 text-right' : 'text-gray-400 text-left'}`}>
                        {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white border-t border-gray-200 flex-shrink-0">
              <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex gap-3 relative">
                <input
                  type="text"
                  placeholder="Type a secure message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="flex-1 rounded-full pl-5 pr-14 py-3 bg-gray-100 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition text-sm shadow-inner"
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim()}
                  className="absolute right-1.5 top-1.5 bottom-1.5 bg-indigo-600 text-white w-10 h-10 flex items-center justify-center rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition shadow-sm"
                >
                  <Send size={16} strokeWidth={2} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
              <MessageSquare size={32} className="text-indigo-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Your messages</h3>
            <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
              Select an existing conversation from the sidebar or click "New Chat" to securely message a registered user via their email address.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
