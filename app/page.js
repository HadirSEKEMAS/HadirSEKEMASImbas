"use client";

import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Html5QrcodeScanner } from 'html5-qrcode';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const CLASS_LIST = [
  "1 Ibnu Majah", "1 Ibnu Sina", "2 Ibnu Majah", "2 Ibnu Sina",
  "3 Ibnu Majah", "3 Ibnu Sina", "4 Ibnu Majah", "4 Ibnu Sina",
  "5 Ibnu Majah", "5 Ibnu Sina", "6 Ibnu Majah", "6 Ibnu Sina"
];

export default function AttendancePage() {
  const [history, setHistory] = useState([]);
  const [statusMsg, setStatusMsg] = useState('Sedia untuk Imbas');
  const [manualId, setManualId] = useState('');
  const [isManual, setIsManual] = useState(false);
  const [bgColor, setBgColor] = useState('#f8fafc'); 
  const [classCounts, setClassCounts] = useState({});
  const [showSummary, setShowSummary] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  
  const scannerRef = useRef(null);
  const isLockedRef = useRef(false);

  // 1. Jam Digital Live
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const totalToday = Object.values(classCounts).reduce((a, b) => a + b, 0);

  // 2. Data Awal + Pendengar Realtime
  useEffect(() => {
    fetchClassSummaries();

    const channel = supabase
      .channel('realtime_attendance')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'students_attendance' },
        (payload) => {
          const newClassName = payload.new.class_name;
          setClassCounts((prev) => ({
            ...prev,
            [newClassName]: (prev[newClassName] || 0) + 1
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchClassSummaries = async () => {
    const today = new Date().toLocaleDateString('en-CA');
    const { data, error } = await supabase.from('students_attendance').select('class_name').eq('date', today);
    if (!error && data) {
      const counts = data.reduce((acc, curr) => {
        acc[curr.class_name] = (acc[curr.class_name] || 0) + 1;
        return acc;
      }, {});
      setClassCounts(counts);
    }
  };

  const processAttendance = async (barcodeText) => {
    try {
      const { data: student, error: fetchError } = await supabase.from('students').select('*').eq('barcode', barcodeText).single();

      if (fetchError || !student) {
        setBgColor('#fef9c3'); 
        setStatusMsg("❌ Murid tidak dijumpai");
        setTimeout(() => { if (!isLockedRef.current) { setBgColor('#f8fafc'); setStatusMsg("Sedia untuk Imbas"); } }, 1500);
        return false;
      }

      isLockedRef.current = true;
      if (scannerRef.current) { try { scannerRef.current.pause(true); } catch (e) {} }

      const now = new Date();
      const localDate = now.toLocaleDateString('en-CA'); 
      const localTime = now.toLocaleTimeString('en-GB', { hour12: false });

      const { error: insertError } = await supabase.from('students_attendance').insert([{
        student_id: student.id,
        class_name: student.class_name_full,
        date: localDate,
        status: '/',
        timestamp: `${localDate} ${localTime}`
      }]);

      if (insertError) {
        setBgColor('#fee2e2'); 
        setStatusMsg(insertError.code === '23505' ? `⚠️ Sudah Hadir: ${student.name}` : `Ralat: ${insertError.message}`);
        handleSuccessReset(2000);
        return false;
      } else {
        playSuccessBeep();
        if (navigator.vibrate) navigator.vibrate(100); 
        setBgColor('#dcfce7'); 
        setStatusMsg(`✅ Berjaya: ${student.name}`);
        
        setHistory(prev => [{ 
          name: student.name, barcode: student.barcode, className: student.class_name_full,
          time: localTime, photo: student.photo_url
        }, ...prev].slice(0, 10));
        
        handleSuccessReset(2000);
        return true;
      }
    } catch (err) {
      console.error(err);
      isLockedRef.current = false;
      return false;
    }
  };

  const handleSuccessReset = (delay) => {
    setTimeout(() => {
      setBgColor('#f8fafc');
      setStatusMsg("Sedia untuk Imbas");
      isLockedRef.current = false; 
      if (scannerRef.current && !isManual) { try { scannerRef.current.resume(); } catch (e) {} }
    }, delay);
  };

  useEffect(() => {
    if (!isManual) {
      const scanner = new Html5QrcodeScanner('reader', { 
        fps: 20, 
        qrbox: { width: 250, height: 150 }, 
        aspectRatio: 1.0 
      });
      scannerRef.current = scanner;
      scanner.render(async (text) => { if (isLockedRef.current) return; await processAttendance(text); }, (err) => {});
      return () => { if (scannerRef.current) scannerRef.current.clear().catch(e => {}); };
    }
  }, [isManual]);

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualId) return;
    const paddedId = manualId.padStart(4, '0');
    const fullBarcode = `STU-${paddedId}`;
    const wasSuccessful = await processAttendance(fullBarcode);
    if (wasSuccessful) setManualId('');
  };

  const playSuccessBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.1);
    } catch (e) {}
  };

  return (
    <main style={{ 
      padding: '24px 16px', textAlign: 'center', maxWidth: '480px', margin: '0 auto', 
      backgroundColor: bgColor, transition: 'background-color 0.4s ease', minHeight: '100vh',
      paddingBottom: '80px' // Ruang untuk butang dashboard di bawah
    }}>
      
      {/* HEADER */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', padding: '16px', backgroundColor: 'white', borderRadius: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <img src="/school_logo.png" alt="Logo Sekolah" style={{ width: '48px', height: '48px', borderRadius: '12px', objectFit: 'contain' }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
            <h1 style={{ color: '#166534', margin: '0', fontSize: '14px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Hadir SEKEMAS</h1>
            <div style={{ fontSize: '22px', fontWeight: '700', color: '#334155' }}>{currentTime}</div>
        </div>
        <button onClick={() => setShowSummary(true)} style={{ padding: '12px', borderRadius: '14px', border: 'none', backgroundColor: '#f1f5f9', cursor: 'pointer', fontSize: '18px' }}>📊</button>
      </header>

      {/* MODAL RINGKASAN */}
      {showSummary && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)', padding: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '28px', padding: '24px', width: '100%', maxWidth: '400px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            <div style={{ backgroundColor: '#f0fdf4', padding: '24px', borderRadius: '20px', marginBottom: '20px', border: '1px solid #dcfce7' }}>
                <div style={{ fontSize: '11px', color: '#166534', fontWeight: '800', letterSpacing: '1px', marginBottom: '4px' }}>JUMLAH KEHADIRAN (LIVE)</div>
                <div style={{ fontSize: '56px', color: '#14532d', fontWeight: '900', lineHeight: '1' }}>{totalToday}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', textAlign: 'left', marginBottom: '24px', maxHeight: '320px', overflowY: 'auto' }}>
              {CLASS_LIST.map(cls => (
                <div key={cls} style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>{cls}</span>
                  <span style={{ fontWeight: '800', color: '#166534', fontSize: '14px' }}>{classCounts[cls] || 0}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setShowSummary(false)} style={{ width: '100%', padding: '18px', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: '16px', fontWeight: '800', fontSize: '16px', cursor: 'pointer' }}>Tutup Paparan</button>
          </div>
        </div>
      )}
      
      {/* PILIHAN MOD */}
      <div style={{ display: 'inline-flex', background: '#e2e8f0', padding: '4px', borderRadius: '16px', marginBottom: '24px' }}>
        <button onClick={() => setIsManual(false)} style={{ padding: '10px 24px', borderRadius: '12px', border: 'none', backgroundColor: !isManual ? 'white' : 'transparent', color: !isManual ? '#1e293b' : '#64748b', fontWeight: '700', transition: '0.3s' }}>📷 Imbas</button>
        <button onClick={() => { setIsManual(true); setManualId(''); }} style={{ padding: '10px 24px', borderRadius: '12px', border: 'none', backgroundColor: isManual ? 'white' : 'transparent', color: isManual ? '#1e293b' : '#64748b', fontWeight: '700', transition: '0.3s' }}>⌨️ Manual</button>
      </div>

      {/* KAWASAN INPUT/SCAN */}
      <div style={{ marginBottom: '24px' }}>
        {!isManual ? (
          <div id="reader" style={{ borderRadius: '24px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', backgroundColor: 'white' }}></div>
        ) : (
          <form onSubmit={handleManualSubmit} style={{ padding: '32px 24px', borderRadius: '24px', backgroundColor: 'white', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', padding: '0 16px', borderRadius: '16px', border: '2px solid #e2e8f0' }}>
                <span style={{ fontSize: '20px', fontWeight: '800', color: '#94a3b8' }}>STU-</span>
                <input 
                  type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0000" value={manualId} 
                  onChange={(e) => { const val = e.target.value; if (/^\d*$/.test(val) && val.length <= 4) setManualId(val); }} 
                  style={{ width: '100px', padding: '16px 8px', fontSize: '28px', border: 'none', background: 'transparent', textAlign: 'center', fontWeight: '800', outline: 'none' }} autoFocus 
                />
              </div>
            </div>
            <button type="submit" style={{ width: '100%', padding: '18px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '16px', fontWeight: '800' }}>Hantar ID</button>
          </form>
        )}
      </div>
      
      {/* STATUS */}
      <div style={{ padding: '16px', borderRadius: '16px', backgroundColor: 'white', border: '1px solid #e2e8f0', marginBottom: '32px' }}>
        <span style={{ fontSize: '14px', fontWeight: '700', color: '#475569' }}>{statusMsg}</span>
      </div>

      {/* SEJARAH TERKINI */}
      <div style={{ textAlign: 'left', marginBottom: '20px' }}>
        <h4 style={{ fontSize: '12px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px', paddingLeft: '8px' }}>Rekod Imbasan Anda</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {history.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '13px' }}>Tiada rekod setakat ini.</div>
          )}
          {history.map((item, index) => (
            <div key={index} style={{ 
              display: 'flex', alignItems: 'center', padding: '12px', borderRadius: '18px', 
              backgroundColor: 'white', border: '1px solid #f1f5f9',
              boxShadow: index === 0 ? '0 10px 15px -3px rgba(0,0,0,0.05)' : 'none',
              animation: index === 0 ? 'popIn 0.4s ease-out' : 'none'
            }}>
              <img src={item.photo} alt="" style={{ width: '52px', height: '52px', borderRadius: '12px', marginRight: '16px', objectFit: 'cover' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '700', fontSize: '14px', color: '#1e293b' }}>{item.name}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{item.barcode} • <span style={{ color: '#2563eb', fontWeight: '700' }}>{item.className}</span></div>
              </div>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8' }}>{item.time}</div>
            </div>
          ))}
        </div>
      </div>

      {/* BUTANG DASHBOARD MURID (NAVIGASI) */}
      <div style={{ position: 'fixed', bottom: '15px', left: '0', right: '0', padding: '0 16px', zIndex: 100 }}>
        <a 
          href="https://hadirsekemas.github.io/pelajar/" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ 
            display: 'block', width: '100%', padding: '16px', backgroundColor: '#1e293b', 
            color: 'white', textDecoration: 'none', borderRadius: '16px', fontWeight: '800', 
            fontSize: '14px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)', textAlign: 'center'
          }}
        >
          🌐 HadirSEKEMAS Murid
        </a>
      </div>

      <style jsx global>{`
        @keyframes popIn {
          0% { opacity: 0; transform: scale(0.9) translateY(10px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        #reader__dashboard_section_csr button {
          background-color: #2563eb !important;
          color: white !important;
          border: none !important;
          padding: 10px 20px !important;
          border-radius: 12px !important;
          font-weight: 700 !important;
          cursor: pointer !important;
        }
        #reader video { border-radius: 24px !important; }
      `}</style>
    </main>
  );
}