import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import sodium from 'libsodium-wrappers';

const SOCKET_URL = 'http://localhost:5000';
const socket = io(SOCKET_URL);

export default function App() {
  const [ready, setReady] = useState(false);
  const [keypair, setKeypair] = useState(null);
  const [username, setUsername] = useState('');
  const [registered, setRegistered] = useState(false);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [text, setText] = useState('');
  const [messages, setMessages] = useState([]);
  const messagesRef = useRef(null);

  useEffect(()=>{ (async ()=>{ await sodium.ready; setReady(true); const kp = sodium.crypto_box_keypair(); setKeypair(kp); })() }, []);

  useEffect(()=> {
    socket.on('users', list => {
      setUsers(list);
    });
    socket.on('message', async (payload) => {
      // payload: { to, from, ciphertext, nonce, fromPublicKey }
      try {
        if (!keypair) return;
        const amI = payload.to === username;
        // If the message is for me, try to decrypt using my private key
        if (amI) {
          const ct = sodium.from_base64(payload.ciphertext, sodium.base64_variants.ORIGINAL);
          const nonce = sodium.from_base64(payload.nonce, sodium.base64_variants.ORIGINAL);
          const senderPub = sodium.from_base64(payload.fromPublicKey, sodium.base64_variants.ORIGINAL);
          const opened = sodium.crypto_box_open_easy(ct, nonce, senderPub, keypair.privateKey);
          const plain = sodium.to_string(opened);
          setMessages(prev => [...prev, { from: payload.from, text: plain, me: false }]);
        } else {
          // if it's my sent message (echo), show as me (we already appended on send)
        }
      } catch (err) {
        console.error('decrypt failed', err);
        setMessages(prev => [...prev, { from: payload.from, text: '[cannot decrypt]', me: false }]);
      }
    });
    return ()=>{ socket.off('users'); socket.off('message'); }
  }, [keypair, username]);

  useEffect(()=>{ if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; }, [messages]);

  const handleRegister = () => {
    if (!username) return alert('enter username');
    const publicKeyB64 = sodium.to_base64(keypair.publicKey, sodium.base64_variants.ORIGINAL);
    socket.emit('register', { username, publicKey: publicKeyB64 });
    setRegistered(true);
  };

  const handleSelect = (u) => {
    setSelected(u);
    setMessages([]); // clear chat view
  };

  const handleSend = () => {
    if (!selected) return alert('select recipient');
    if (!text) return;
    const recipientPubB64 = selected.publicKey;
    // encrypt message using recipientPublicKey and my private key
    const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
    const ct = sodium.crypto_box_easy(sodium.from_string(text), nonce, sodium.from_base64(recipientPubB64, sodium.base64_variants.ORIGINAL), keypair.privateKey);
    const payload = {
      to: selected.username,
      from: username,
      ciphertext: sodium.to_base64(ct, sodium.base64_variants.ORIGINAL),
      nonce: sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL),
      fromPublicKey: sodium.to_base64(keypair.publicKey, sodium.base64_variants.ORIGINAL)
    };
    socket.emit('sendMessage', payload);
    // append local message
    setMessages(prev => [...prev, { from: username, text, me: true }]);
    setText('');
  };

  return (
    <div className="app">
      <header>
        <h2>Simple E2EE Chat — 2 users</h2>
        <small>{ready ? 'crypto ready' : 'loading crypto...'}</small>
      </header>

      <div className="container">
        <div className="left">
          <div>
            <input type="text" placeholder="your username" value={username} onChange={e=>setUsername(e.target.value)} disabled={registered} />
            <button onClick={handleRegister} disabled={!ready || registered}>Register</button>
            {registered && <div><small>Registered as <strong>{username}</strong></small></div>}
          </div>

          <hr style={{margin:'10px 0'}} />

          <div><strong>Online users</strong></div>
          <div style={{marginTop:8}}>
            {users.filter(u=>u.username!==username).length===0 && <small>No other users online</small>}
            {users.filter(u=>u.username!==username).map(u=>(
              <div key={u.username} className={'user ' + (selected && selected.username===u.username ? 'selected' : '')} onClick={()=>handleSelect(u)}>
                <span>{u.username}</span>
                <span style={{fontSize:12, color:'#9fb6c6'}}>pub</span>
              </div>
            ))}
          </div>
        </div>

        <div className="right">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
            <div><strong>Chat</strong> {selected ? 'with ' + selected.username : '(select a user)'}</div>
            <div><small>Two-user demo</small></div>
          </div>

          <div className="messages" ref={messagesRef}>
            {messages.map((m, i)=>(
              <div key={i} className={'bubble ' + (m.me ? 'me' : 'them')}>
                <div style={{fontSize:12, opacity:0.8}}>{m.me ? 'You' : m.from}</div>
                <div style={{marginTop:6}}>{m.text}</div>
              </div>
            ))}
          </div>

          <div className="inputRow">
            <input type="text" placeholder="Type a message" value={text} onChange={e=>setText(e.target.value)} />
            <button onClick={handleSend}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}
