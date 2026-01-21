"use client";

import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Html5QrcodeScanner } from 'html5-qrcode';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const CLASS_LIST = [
  "1 Ibnu Majah", "1 Ibnu Sina",
  "2 Ibnu Majah", "2 Ibnu Sina",
  "3 Ibnu Majah", "3 Ibnu Sina",
  "4 Ibnu Majah", "4 Ibnu Sina",
  "5 Ibnu Majah", "5 Ibnu Sina",
  "6 Ibnu Majah", "6 Ibnu Sina"
];

export default function AttendancePage() {
  const [history, setHistory] = useState([]);
  const [statusMsg, setStatusMsg] = useState('Sedia untuk Imbas');
  const [manualId, setManualId] = useState('');
  const [isManual, setIsManual] = useState(false);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [classCounts, setClassCounts] = useState({});
  const [showSummary, setShowSummary] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const scannerRef = useRef(null);

  // Live Clock Logic
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-GB')); // 24-hour format
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Calculate grand total from the class breakdown
  const totalToday = Object.values(classCounts).reduce((a, b) => a + b, 0);

  useEffect(() => {
    fetchClassSummaries();
  }, []);

  const fetchClassSummaries = async () => {
    const today = new Date().toLocaleDateString('en-CA');
    const { data, error } = await supabase
      .from('students_attendance')
      .select('class_name')
      .eq('date', today);
    
    if (!error && data) {
      const counts = data.reduce((acc, curr) => {
        acc[curr.class_name] = (acc[curr.class_name] || 0) + 1;
        return acc;
      }, {});
      setClassCounts(counts);
    }
  };

  const processAttendance = async (barcodeText) => {
    setBgColor('#e0f7fa'); 
    setStatusMsg("Memproses...");

    try {
      const { data: student, error: fetchError } = await supabase
        .from('students')
        .select('*')
        .eq('barcode', barcodeText)
        .single();

      if (fetchError || !student) {
        setBgColor('#fff176'); 
        setStatusMsg("❌ Tidak dijumpai!");
        handlePostProcess(800);
        return false;
      }

      const now = new Date();
      const localDate = now.toLocaleDateString('en-CA'); 
      const localTime = now.toLocaleTimeString('en-GB', { hour12: false });

      const { error: insertError } = await supabase
        .from('students_attendance')
        .insert([{
          student_id: student.id,
          class_name: student.class_name_full,
          date: localDate,
          status: '/',
          timestamp: `${localDate} ${localTime}`
        }]);

      if (insertError) {
        setBgColor('#ffccbc');
        setStatusMsg(insertError.code === '23505' ? `⚠️ ${student.name} (Sudah Record)` : `Ralat: ${insertError.message}`);
        handlePostProcess(800);
        return false;
      } else {
        playSuccessBeep();
        if (navigator.vibrate) navigator.vibrate(100); 
        
        setBgColor('#81c784'); 
        setStatusMsg(`✅ ${student.name}`);
        
        setClassCounts(prev => ({
          ...prev,
          [student.class_name_full]: (prev[student.class_name_full] || 0) + 1
        }));

        setHistory(prev => [{ 
          name: student.name, 
          barcode: student.barcode,
          className: student.class_name_full,
          time: localTime, 
          photo: student.photo_url
        }, ...prev].slice(0, 10));
        
        handlePostProcess(600);
        return true;
      }
    } catch (err) {
      setBgColor('#ef9a9a');
      setStatusMsg("Ralat Sistem.");
      handlePostProcess(1000);
      return false;
    }
  };

  const handlePostProcess = (delay) => {
    setTimeout(() => {
      setManualId(''); 
      setBgColor('#ffffff');
      setStatusMsg(isManual ? "Sedia" : "Sedia untuk Imbas");
      if (scannerRef.current && !isManual) {
        try { scannerRef.current.resume(); } catch (e) {}
      }
    }, delay);
  };

  useEffect(() => {
    if (!isManual) {
      const scanner = new Html5QrcodeScanner('reader', {
        fps: 30, 
        qrbox: { width: 320, height: 180 }, // Optimized for 1D traditional barcodes
        aspectRatio: 1.0,
      });
      scannerRef.current = scanner;
      scanner.render(async (text) => {
        scanner.pause(true);
        await processAttendance(text);
      }, (err) => {});
      return () => { if (scannerRef.current) scannerRef.current.clear().catch(e => {}); };
    }
  }, [isManual]);

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (manualId.length !== 4) {
      setStatusMsg("⚠️ Masukkan tepat 4 digit!");
      setBgColor('#fff176');
      return;
    }
    await processAttendance(`STU-${manualId}`);
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
      padding: '15px', 
      textAlign: 'center', 
      maxWidth: '500px', 
      margin: '0 auto', 
      fontFamily: 'sans-serif',
      backgroundColor: bgColor,
      transition: 'background-color 0.2s ease',
      minHeight: '100vh',
      position: 'relative'
    }}>
      
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <img src="/school_logo.jpg" alt="Logo" style={{ width: '45px', height: 'auto' }} />
        
        <div style={{ textAlign: 'center' }}>
            <h1 style={{ color: '#2e7d32', margin: '0', fontSize: '18px' }}>Hadir SEKEMAS</h1>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#333', marginTop: '2px' }}>{currentTime}</div>
        </div>

        <button 
          onClick={() => setShowSummary(true)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #2e7d32', backgroundColor: 'white', color: '#2e7d32', fontWeight: 'bold', fontSize: '12px' }}
        >
          📊 Ringkasan
        </button>
      </div>

      {/* OVERLAY SUMMARY MODAL */}
      {showSummary && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{ backgroundColor: 'white', borderRadius: '15px', padding: '20px', width: '100%', maxWidth: '400px' }}>
            
            <div style={{ backgroundColor: '#f0fdf4', padding: '15px', borderRadius: '10px', marginBottom: '15px', border: '1px solid #bcf0da' }}>
                <div style={{ fontSize: '12px', color: '#666', fontWeight: 'bold' }}>JUMLAH KESELURUHAN</div>
                <div style={{ fontSize: '36px', color: '#2e7d32', fontWeight: '900' }}>{totalToday}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', textAlign: 'left', marginBottom: '20px' }}>
              {CLASS_LIST.map(cls => (
                <div key={cls} style={{ borderBottom: '1px solid #eee', padding: '4px', fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{cls}:</span>
                  <span style={{ fontWeight: 'bold', color: '#2e7d32' }}>{classCounts[cls] || 0}</span>
                </div>
              ))}
            </div>
            
            <button 
              onClick={() => setShowSummary(false)}
              style={{ width: '100%', padding: '14px', backgroundColor: '#2e7d32', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
            >
              TUTUP
            </button>
          </div>
        </div>
      )}
      
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '15px' }}>
        <button 
          onClick={() => { setIsManual(!isManual); setManualId(''); }}
          style={{ padding: '10px 20px', borderRadius: '25px', border: 'none', backgroundColor: '#2196F3', color: 'white', fontWeight: 'bold' }}
        >
          {isManual ? "📷 Kamera" : "⌨️ Manual ID"}
        </button>
      </div>

      {!isManual ? (
        <div id="reader" style={{ borderRadius: '15px', overflow: 'hidden', border: '2px solid #ccc', backgroundColor: 'white' }}></div>
      ) : (
        <form onSubmit={handleManualSubmit} style={{ padding: '20px', border: '2px dashed #2196F3', borderRadius: '15px', backgroundColor: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '15px' }}>
            <span style={{ backgroundColor: '#ddd', padding: '12px', fontSize: '20px', fontWeight: 'bold', border: '1px solid #ccc', borderRadius: '8px 0 0 8px' }}>STU-</span>
            <input 
              type="number" inputMode="numeric" placeholder="0000" value={manualId}
              onChange={(e) => { if (e.target.value.length <= 4) setManualId(e.target.value); }}
              style={{ width: '100px', padding: '12px', fontSize: '20px', border: '1px solid #ccc', borderLeft: 'none', borderRadius: '0 8px 8px 0', textAlign: 'center' }}
              autoFocus
            />
          </div>
          <button type="submit" style={{ width: '100%', padding: '14px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>Hantar</button>
        </form>
      )}
      
      <div style={{ margin: '15px 0', padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #ddd', minHeight: '45px' }}>
        <strong style={{ fontSize: '16px' }}>{statusMsg}</strong>
      </div>

      <div style={{ textAlign: 'left', marginTop: '10px' }}>
        <h4 style={{ borderBottom: '2px solid #eee', paddingBottom: '5px', fontSize: '14px', color: '#444' }}>Senarai Terkini</h4>
        {history.map((item, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', padding: '10px', borderBottom: '1px solid #eee', backgroundColor: index === 0 ? 'rgba(255,255,255,0.8)' : 'transparent' }}>
            <img src={item.photo} alt="" style={{ width: '45px', height: '45px', borderRadius: '6px', marginRight: '12px', objectFit: 'cover', border: '1px solid #ddd' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{item.name}</div>
              <div style={{ fontSize: '11px', color: '#2196F3', fontWeight: 'bold' }}>{item.barcode} • {item.className}</div>
            </div>
            <div style={{ fontSize: '11px', color: '#999' }}>{item.time}</div>
          </div>
        ))}
      </div>
    </main>
  );
}