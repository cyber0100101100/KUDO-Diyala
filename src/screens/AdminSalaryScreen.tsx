import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, getDocs, doc, updateDoc, increment, getDoc, addDoc, serverTimestamp, onSnapshot, deleteDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { User } from '../types';
import { useAuth } from '../hooks/useAuth';
import { getCurrentMonthBaghdadStr, formatDateNumeric } from '../lib/timeUtils';
import AdminTopHeader from '../components/AdminTopHeader';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function AdminSalaryScreen() {
  const { user, loading: authLoading } = useAuth();
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null);
  const [bonus, setBonus] = useState('');
  const [advance, setAdvance] = useState('');
  const [deduction, setDeduction] = useState('');
  const [overtime, setOvertime] = useState('');
  const [baseSalary, setBaseSalary] = useState('');
  const [reason, setReason] = useState('');
  const [viewMode, setViewMode] = useState<'management' | 'reports'>('management');
  const [attendanceStats, setAttendanceStats] = useState<{[key: string]: { attended: number, absent: number }}>({});
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthBaghdadStr()); // YYYY-MM
  const [financialRecords, setFinancialRecords] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [editingAttendanceUser, setEditingAttendanceUser] = useState<User | null>(null);
  const [modalDate, setModalDate] = useState(new Date().toISOString().split('T')[0]);
  const [modalStatus, setModalStatus] = useState<'present' | 'absent'>('present');

  const handleSaveAttendance = async () => {
    if (!editingAttendanceUser || !modalDate || syncing) return;
    setSyncing(true);
    try {
      // 1. Check if record exists for this date
      const q = query(
        collection(db, 'attendance'),
        where('userId', '==', editingAttendanceUser.uid),
        where('date', '==', modalDate)
      );
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        // Update existing
        await updateDoc(snap.docs[0].ref, {
          status: modalStatus,
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid
        });
      } else {
        // Create new
        await addDoc(collection(db, 'attendance'), {
          userId: editingAttendanceUser.uid,
          userName: editingAttendanceUser.displayName,
          date: modalDate,
          status: modalStatus,
          createdAt: serverTimestamp(),
          createdBy: user?.uid,
          manual: true
        });
      }

      // 2. Sync Financial Records
      if (modalStatus === 'present') {
        // Remove deduction
        const financialQ = query(
          collection(db, 'financial_records'),
          where('userId', '==', editingAttendanceUser.uid),
          where('type', '==', 'absence_deduction'),
          where('reason', '>=', `خصم غياب يوم ${modalDate}`),
          where('reason', '<=', `خصم غياب يوم ${modalDate}\uf8ff`)
        );
        const financialSnap = await getDocs(financialQ);
        for (const docRef of financialSnap.docs) {
          await deleteDoc(docRef.ref);
        }
      } else {
        // Add deduction if not already there
        const financialQ = query(
          collection(db, 'financial_records'),
          where('userId', '==', editingAttendanceUser.uid),
          where('type', '==', 'absence_deduction'),
          where('reason', '>=', `خصم غياب يوم ${modalDate}`),
          where('reason', '<=', `خصم غياب يوم ${modalDate}\uf8ff`)
        );
        const financialSnap = await getDocs(financialQ);
        if (financialSnap.empty) {
          const dailyDeduction = Math.trunc((editingAttendanceUser.baseSalary || 0) / 30);
          await addDoc(collection(db, 'financial_records'), {
            userId: editingAttendanceUser.uid,
            userName: editingAttendanceUser.displayName,
            bonus: 0,
            advance: 0,
            deduction: dailyDeduction,
            overtime: 0,
            period: modalDate.slice(0, 7),
            reason: `خصم غياب يوم ${modalDate} (تعديل يدوي)`,
            createdAt: serverTimestamp(),
            createdBy: user?.uid,
            type: 'absence_deduction'
          });
        }
      }
      
      alert('تم تحديث البيانات والمزامنة بنجاح');
      setEditingAttendanceUser(null);
    } catch (error) {
      console.error("Error saving attendance:", error);
      alert('فشل حفظ البيانات');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (selectedEmployee) {
      setBaseSalary(selectedEmployee.baseSalary?.toString() || '');
    } else {
      setBaseSalary('');
    }
    setBonus('');
    setAdvance('');
    setDeduction('');
    setOvertime('');
    setReason('');
  }, [selectedEmployee]);

  useEffect(() => {
    let unsubUsers: (() => void) | undefined;
    let unsubAttend: (() => void) | undefined;
    let unsubFin: (() => void) | undefined;

    function setupListeners() {
      try {
        if (authLoading || !user || !auth.currentUser) return;
        if (user.role !== 'admin' && user.role !== 'manager' && user.role !== 'supervisor' && user.email !== 'antrippy1@gmail.com' && user.email !== 'ath222139@gmail.com') return;
        
        // Calculate date ranges for the selected month
        const [year, month] = selectedMonth.split('-').map(Number);
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        
        // Real-time employees listener
        const q = query(
          collection(db, 'users'), 
          where('role', 'in', ['employee', 'admin', 'supervisor']),
          where('groupStatus', '==', 'joined')
        );
        unsubUsers = onSnapshot(q, (snap) => {
          const fetchedEmployees = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
          setEmployees(fetchedEmployees);
          setLoading(false);
        });

        // Attendance for selected month
        const attendQuery = query(
          collection(db, 'attendance'),
          where('date', '>=', startDate),
          where('date', '<=', endDate)
        );

        unsubAttend = onSnapshot(attendQuery, (snapshot) => {
          const stats: {[key: string]: { attended: number, absent: number }} = {};
          snapshot.docs.forEach(doc => {
            const data = doc.data();
            const userId = data.userId;
            if (!stats[userId]) stats[userId] = { attended: 0, absent: 0 };
            if (data.status === 'present' || data.status === 'late') {
              stats[userId].attended++;
            } else if (data.status === 'absent') {
              stats[userId].absent++;
            }
          });
          setAttendanceStats(stats);
        });

        // Financial records for selected month
        const finQuery = query(
          collection(db, 'financial_records'),
          where('period', '==', selectedMonth)
        );

        unsubFin = onSnapshot(finQuery, (snapshot) => {
          const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setFinancialRecords(records);
        });

      } catch (error) {
        console.error("Error setting up listeners:", error);
        setLoading(false);
      }
    }

    setupListeners();

    return () => {
      if (unsubUsers) unsubUsers();
      if (unsubAttend) unsubAttend();
      if (unsubFin) unsubFin();
    };
  }, [user, authLoading, selectedMonth]);

  const isSupervisorRestriction = user?.role === 'supervisor' && (selectedEmployee?.uid === user?.uid || selectedEmployee?.role === 'supervisor');

  const handleApply = async () => {
    if (!selectedEmployee || !user) return;
    
    if (isSupervisorRestriction) {
      alert('عذراً، لا يمكنك تعديل راتبك الخاص أو راتب مشرف آخر. هذه الصلاحية للمدير العام فقط.');
      return;
    }
    const bonusNum = Number(bonus) || 0;
    const advanceNum = Number(advance) || 0;
    const deductionNum = Number(deduction) || 0;
    const overtimeNum = Number(overtime) || 0;
    const baseSalaryNum = Number(baseSalary) || 0;

    if ((user.role === 'admin' || user.role === 'supervisor') && (bonusNum > 40000 || deductionNum > 40000 || overtimeNum > 40000 || advanceNum > 40000)) {
      alert('عذراً، الحد الأقصى المسموح به للمسؤول/المشرف هو 40,000 دينار. سيتم تحويل الطلبات الكبيرة للمدير العام للموافقة.');
      try {
        const requests = [];
        if (bonusNum > 40000) {
          requests.push(addDoc(collection(db, 'requests'), {
            userId: selectedEmployee.uid,
            requesterId: user.uid,
            type: 'bonus',
            amount: bonusNum,
            status: 'pending',
            createdAt: serverTimestamp(),
            reason: `طلب مكافأة من ${user.role === 'admin' ? 'المسؤول' : 'المشرف'} ${user.displayName}`
          }));
        }
        if (advanceNum > 40000) {
          requests.push(addDoc(collection(db, 'requests'), {
            userId: selectedEmployee.uid,
            requesterId: user.uid,
            type: 'advance',
            amount: advanceNum,
            status: 'pending',
            createdAt: serverTimestamp(),
            reason: `طلب سلفة من ${user.role === 'admin' ? 'المسؤول' : 'المشرف'} ${user.displayName}`
          }));
        }
        if (deductionNum > 40000) {
          requests.push(addDoc(collection(db, 'requests'), {
            userId: selectedEmployee.uid,
            requesterId: user.uid,
            type: 'deduction',
            amount: deductionNum,
            status: 'pending',
            createdAt: serverTimestamp(),
            reason: `طلب خصم من ${user.role === 'admin' ? 'المسؤول' : 'المشرف'} ${user.displayName}`
          }));
        }
        if (overtimeNum > 40000) {
          requests.push(addDoc(collection(db, 'requests'), {
            userId: selectedEmployee.uid,
            requesterId: user.uid,
            type: 'overtime',
            amount: overtimeNum,
            status: 'pending',
            reason: `طلب أجور إضافية من ${user.role === 'admin' ? 'المسؤول' : 'المشرف'} ${user.displayName}`,
            createdAt: serverTimestamp()
          }));
        }
        
        await Promise.all(requests);
        
        // Also apply the smaller amounts if any
        const updates: any = {};
        let appliedAny = false;
        if (bonusNum > 0 && bonusNum <= 40000) { updates.bonus = increment(bonusNum); appliedAny = true; }
        if (advanceNum > 0 && advanceNum <= 40000) { updates.advance = increment(advanceNum); appliedAny = true; }
        if (deductionNum > 0 && deductionNum <= 40000) { updates.deduction = increment(deductionNum); appliedAny = true; }
        if (overtimeNum > 0 && overtimeNum <= 40000) { updates.overtime = increment(overtimeNum); appliedAny = true; }
        
        if (appliedAny) {
          await updateDoc(doc(db, 'users', selectedEmployee.uid), updates);
          
          // Create financial record for the direct application
          await addDoc(collection(db, 'financial_records'), {
            userId: selectedEmployee.uid,
            userName: selectedEmployee.displayName,
            bonus: (bonusNum > 0 && bonusNum <= 40000) ? bonusNum : 0,
            advance: (advanceNum > 0 && advanceNum <= 40000) ? advanceNum : 0,
            deduction: (deductionNum > 0 && deductionNum <= 40000) ? deductionNum : 0,
            overtime: (overtimeNum > 0 && overtimeNum <= 40000) ? overtimeNum : 0,
            period: selectedMonth,
            reason: reason || 'تحديث إداري (مباشر)',
            createdAt: serverTimestamp(),
            createdBy: user.uid
          });
          
          // Notify manager about approved actions
          const managerQuery = query(collection(db, 'users'), where('role', '==', 'manager'));
          const managerSnap = await getDocs(managerQuery);
          for (const mDoc of managerSnap.docs) {
            await addDoc(collection(db, 'notifications'), {
              userId: mDoc.id,
              title: 'إشعار إداري: عمليات مالية',
              message: `قام ${user.role === 'admin' ? 'المسؤول' : 'المشرف'} ${user.displayName} بتنفيذ عمليات مالية للموظف ${selectedEmployee.displayName} (مبالغ أقل من 40,000)`,
              type: 'salary',
              createdAt: serverTimestamp(),
              isRead: false
            });
          }
        }

        setBonus('');
        setAdvance('');
        setDeduction('');
        setOvertime('');
        setReason('');
        setSelectedEmployee(null);
        alert('تم تقديم الطلبات للمدير العام وتنفيذ العمليات المسموح بها');
      } catch (e) {
        console.error(e);
      }
      return;
    }

    try {
      const userRef = doc(db, 'users', selectedEmployee.uid);
      const updates: any = {};
      
      if (baseSalary) updates.baseSalary = baseSalaryNum;
      await updateDoc(userRef, updates);

      // Create a specific financial record for this period
      const recordData = {
        userId: selectedEmployee.uid,
        userName: selectedEmployee.displayName,
        bonus: bonusNum,
        advance: advanceNum,
        deduction: deductionNum,
        overtime: overtimeNum,
        period: selectedMonth, // e.g., "2026-08"
        reason: reason || 'تحديث دوري',
        createdAt: serverTimestamp(),
        createdBy: user.uid
      };

      await addDoc(collection(db, 'financial_records'), recordData);
      
      // If supervisor/admin applied small amounts, notify manager
      if (user.role === 'admin' || user.role === 'supervisor') {
        const managerQuery = query(collection(db, 'users'), where('role', '==', 'manager'));
        const managerSnap = await getDocs(managerQuery);
        for (const mDoc of managerSnap.docs) {
          await addDoc(collection(db, 'notifications'), {
            userId: mDoc.id,
            title: 'إشعار إداري: عمليات مالية',
            message: `قام ${user.role === 'admin' ? 'المسؤول' : 'المشرف'} ${user.displayName} بتنفيذ عمليات مالية للموظف ${selectedEmployee.displayName}`,
            type: 'salary',
            createdAt: serverTimestamp(),
            isRead: false
          });
        }
      }

      // Send notification
      if (bonusNum > 0) {
        await addDoc(collection(db, 'notifications'), {
          userId: selectedEmployee.uid,
          title: 'تم منحك مكافأة',
          message: `تم منحك مكافأة بقيمة ${Math.trunc(bonusNum).toLocaleString()} دينار عراقي من قبل ${user.displayName || 'الإدارة'}`,
          type: 'salary',
          createdAt: serverTimestamp(),
          isRead: false
        });
      }
      if (advanceNum > 0) {
        await addDoc(collection(db, 'notifications'), {
          userId: selectedEmployee.uid,
          title: 'تم صرف سلفة مالية',
          message: `تم صرف سلفة مالية لك بقيمة ${Math.trunc(advanceNum).toLocaleString()} دينار عراقي من قبل ${user.displayName || 'الإدارة'}، سيتم خصمها من الراتب النهائي.`,
          type: 'salary',
          createdAt: serverTimestamp(),
          isRead: false
        });
      }
      if (deductionNum > 0) {
        await addDoc(collection(db, 'notifications'), {
          userId: selectedEmployee.uid,
          title: 'تم تطبيق خصم',
          message: `تم تطبيق خصم بقيمة ${Math.trunc(deductionNum).toLocaleString()} دينار عراقي من قبل ${user.displayName || 'الإدارة'}`,
          type: 'salary',
          createdAt: serverTimestamp(),
          isRead: false
        });
      }
      if (overtimeNum > 0) {
        await addDoc(collection(db, 'notifications'), {
          userId: selectedEmployee.uid,
          title: 'إضافة أجور إضافية (Overtime)',
          message: `تم إضافة أجور إضافية بقيمة ${Math.trunc(overtimeNum).toLocaleString()} دينار عراقي لمجهودك الإضافي`,
          type: 'salary',
          createdAt: serverTimestamp(),
          isRead: false
        });
      }

      // Reset form
      setBonus('');
      setAdvance('');
      setDeduction('');
      setOvertime('');
      setReason('');
      setSelectedEmployee(null);
      alert('تم تحديث البيانات المالية بنجاح');
    } catch (error) {
      console.error("Error updating salary info:", error);
    }
  };

  const toggleAttendanceStatus = async (attendanceDoc: any) => {
    if (!editingAttendanceUser || syncing) return;
    setSyncing(true);
    try {
      const newStatus = attendanceDoc.status === 'present' ? 'absent' : 'present';
      const date = attendanceDoc.date;
      
      // 1. Update Attendance Document
      await updateDoc(doc(db, 'attendance', attendanceDoc.id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid
      });

      // 2. Sync with Financial Records
      if (newStatus === 'present') {
        // Find and remove any absence deduction for this specific date
        const q = query(
          collection(db, 'financial_records'),
          where('userId', '==', editingAttendanceUser.uid),
          where('type', '==', 'absence_deduction'),
          where('reason', '>=', `خصم غياب يوم ${date}`),
          where('reason', '<=', `خصم غياب يوم ${date}\uf8ff`)
        );
        const snap = await getDocs(q);
        for (const recordDoc of snap.docs) {
          await deleteDoc(recordDoc.ref);
        }
      } else {
        // Create absence deduction
        const dailyDeduction = Math.trunc((editingAttendanceUser.baseSalary || 0) / 30);
        await addDoc(collection(db, 'financial_records'), {
          userId: editingAttendanceUser.uid,
          userName: editingAttendanceUser.displayName,
          bonus: 0,
          advance: 0,
          deduction: dailyDeduction,
          overtime: 0,
          period: date.slice(0, 7),
          reason: `خصم غياب يوم ${date} (تعديل يدوي)`,
          createdAt: serverTimestamp(),
          createdBy: user?.uid,
          type: 'absence_deduction'
        });
      }
    } catch (error) {
      console.error("Error toggling attendance:", error);
    } finally {
      setSyncing(false);
    }
  };

  const getEmployeeStats = (userId: string, baseSal: number = 0) => {
    const records = financialRecords.filter(r => r.userId === userId);
    const stats = records.reduce((acc, curr) => ({
      bonus: acc.bonus + (curr.bonus || 0),
      advance: acc.advance + (curr.advance || 0),
      deduction: acc.deduction + (curr.deduction || 0),
      overtime: acc.overtime + (curr.overtime || 0)
    }), { bonus: 0, advance: 0, deduction: 0, overtime: 0 });

    const att = attendanceStats[userId] || { attended: 0, absent: 0 };
    const absenceDeductionFromAtt = (baseSal / 30) * att.absent;
    
    // Improved logic: exclude automated absence deductions if they are already manually recorded or approved
    const hasAbsenceDeductionInRecords = records.some(r => (r.reason && (r.reason.includes('غياب') || r.reason.includes('Absence'))) || r.type === 'absence_deduction');
    
    return {
      ...stats,
      absenceDeduction: hasAbsenceDeductionInRecords ? 0 : Math.round(absenceDeductionFromAtt)
    };
  };

  const getTotals = () => {
    return employees.reduce((acc, emp) => {
      const base = emp.baseSalary || 0;
      const stats = getEmployeeStats(emp.uid, base);
      const att = attendanceStats[emp.uid] || { attended: 0, absent: 0 };
      
      return {
        base: acc.base + base,
        bonus: acc.bonus + stats.bonus,
        deduction: acc.deduction + stats.deduction + stats.absenceDeduction,
        advance: acc.advance + stats.advance,
        overtime: acc.overtime + stats.overtime,
        attended: acc.attended + att.attended,
        absent: acc.absent + att.absent
      };
    }, { base: 0, bonus: 0, deduction: 0, advance: 0, overtime: 0, attended: 0, absent: 0 });
  };

  const totals = getTotals();

  const handleExportExcel = () => {
    const data = employees.map(emp => {
      const base = emp.baseSalary || 0;
      const stats = getEmployeeStats(emp.uid, base);
      const totalDeduction = stats.deduction + stats.absenceDeduction;

      return {
        'اسم الموظف': emp.displayName,
        'المسمى الوظيفي': emp.jobTitle,
        'أيام الحضور': attendanceStats[emp.uid]?.attended || 0,
        'أيام الغياب': attendanceStats[emp.uid]?.absent || 0,
        'التأخيرات': emp.lateCount || 0,
        'الراتب الأساسي': base,
        'المكافآت': stats.bonus,
        'السلف': stats.advance,
        'الخصومات': totalDeduction,
        'الأجور الإضافية': stats.overtime,
        'الصافي النهائي': base + stats.bonus + stats.overtime - totalDeduction - stats.advance
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payroll Report');
    XLSX.writeFile(wb, `Payroll_Report_${selectedMonth}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    
    doc.setFontSize(18);
    doc.text('KUDO - Payroll Report', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Period: ${selectedMonth} | Generated: ${formatDateNumeric(new Date())}`, 105, 28, { align: 'center' });

    const tableData = employees.map(emp => {
      const base = emp.baseSalary || 0;
      const stats = getEmployeeStats(emp.uid, base);
      const totalDeduction = stats.deduction + stats.absenceDeduction;
      
      const net = base + stats.bonus + stats.overtime - totalDeduction - stats.advance;
      return [
        emp.displayName,
        emp.jobTitle,
        (attendanceStats[emp.uid]?.attended || 0).toString(),
        (attendanceStats[emp.uid]?.absent || 0).toString(),
        (emp.lateCount || 0).toString(),
        Math.trunc(base).toLocaleString(),
        Math.trunc(stats.bonus).toLocaleString(),
        Math.trunc(stats.advance).toLocaleString(),
        Math.trunc(totalDeduction).toLocaleString(),
        Math.trunc(stats.overtime).toLocaleString(),
        Math.trunc(net).toLocaleString()
      ];
    });

    autoTable(doc, {
      startY: 35,
      head: [['Employee', 'Job Title', 'Attended', 'Absent', 'Lates', 'Base', 'Bonus', 'Advance', 'Deduction', 'Overtime', 'Net']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [227, 30, 36] },
      styles: { fontSize: 8 }
    });

    doc.save(`Payroll_Report_${selectedMonth}.pdf`);
  };

  const handleExport = () => {
    // Export both as per user request ("PDF and compatible with Excel")
    handleExportExcel();
    handleExportPDF();
    alert('تم جاري تحميل التقارير (PDF + Excel)');
  };

  return (
    <div className="font-sans rtl flex flex-col min-h-screen antialiased bg-white pb-20 pt-16 md:pt-20">
      <AdminTopHeader title="إدارة الرواتب" />
      
      <div className="p-6 md:p-12 max-w-7xl mx-auto w-full space-y-10 md:space-y-16 relative">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-red-50 rounded-full blur-[120px] opacity-40 pointer-events-none -z-10"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-blue-50 rounded-full blur-[100px] opacity-30 pointer-events-none -z-10"></div>
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-slate-100 pb-10">
          <div className="space-y-2 md:space-y-4">
            <h1 className="text-3xl md:text-5xl font-black text-slate-900  er leading-tight">إدارة الرواتب</h1>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-slate-100 shadow-sm">
                <span className="w-2 h-2 bg-[#E31E24] rounded-full animate-pulse"></span>
                <p className="text-[10px] md:text-[11px] font-black text-slate-500 uppercase  ">دورة مالية: {selectedMonth}</p>
              </div>
              <div className="relative group">
                <input 
                  type="month" 
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-slate-100/50 hover:bg-slate-100 border border-transparent hover:border-slate-200 rounded-xl px-4 py-2 text-[10px] font-black text-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all cursor-pointer"
                />
              </div>
            </div>
          </div>
          
          <div className="flex bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm self-start">
            <button 
              onClick={() => setViewMode('management')}
              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase   transition-all ${viewMode === 'management' ? 'bg-[#E31E24] text-white shadow-lg shadow-red-100' : 'text-slate-400 hover:text-slate-600'}`}
            >
              الإدارة
            </button>
            <button 
              onClick={() => setViewMode('reports')}
              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase   transition-all ${viewMode === 'reports' ? 'bg-[#E31E24] text-white shadow-lg shadow-red-100' : 'text-slate-400 hover:text-slate-600'}`}
            >
              التقارير
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {viewMode === 'management' ? (
            <motion.div 
              key="management"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-10"
            >
              {/* Employee List Selection */}
              <div className="lg:col-span-1 bg-white rounded-[32px] md:rounded-[40px] p-6 md:p-8 border border-slate-50 shadow-sm flex flex-col">
                <div className="flex items-center justify-between mb-6 md:mb-8 px-2">
                  <h2 className="text-base md:text-lg font-black text-slate-900  ">اختيار الموظف</h2>
                  <div className="w-8 md:w-10 h-8 md:h-10 bg-slate-50 rounded-xl md:rounded-2xl flex items-center justify-center text-slate-400">
                    <span className="material-symbols-outlined text-lg md:text-xl">group</span>
                  </div>
                </div>
                
                <div className="space-y-3 md:space-y-4 max-h-[400px] md:max-h-[600px] overflow-y-auto pr-2 no-scrollbar">
                  {employees.map(emp => (
                    <button
                      key={emp.uid}
                      onClick={() => setSelectedEmployee(emp)}
                      className={`w-full flex items-center gap-4 md:gap-5 p-4 md:p-5 rounded-2xl md:rounded-[28px] border transition-all text-right active:scale-[0.98] ${
                        selectedEmployee?.uid === emp.uid
                        ? 'bg-red-50 border-red-100 shadow-lg shadow-red-500/5'
                        : 'bg-white border-slate-50 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="w-12 md:w-14 h-12 md:h-14 rounded-xl md:rounded-2xl overflow-hidden bg-slate-50 flex-shrink-0 border-2 border-white shadow-sm">
                        <img src={emp.profileImageUrl || `https://ui-avatars.com/api/?name=${emp.displayName}`} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1">
                        <p className={`font-black text-xs md:text-sm mb-0.5 md:mb-1 ${selectedEmployee?.uid === emp.uid ? 'text-[#E31E24]' : 'text-slate-900'}`}>{emp.displayName}</p>
                        <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase   opacity-60">{emp.employeeId || 'KUDO-EMP'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Management Form */}
              <div className="lg:col-span-2">
                {selectedEmployee ? (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-white rounded-[32px] md:rounded-[40px] p-6 md:p-12 border border-slate-50 shadow-sm"
                  >
                    <div className="flex items-center gap-4 md:gap-8 mb-8 md:mb-12 bg-slate-50/50 p-6 md:p-8 rounded-3xl md:rounded-[32px] border border-slate-50">
                      <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl md:rounded-[32px] overflow-hidden border-4 border-white shadow-xl">
                        <img src={selectedEmployee.profileImageUrl || `https://ui-avatars.com/api/?name=${selectedEmployee.displayName}`} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <h2 className="text-xl md:text-3xl font-black text-slate-900  ">{selectedEmployee.displayName}</h2>
                        <div className="flex items-center gap-2 md:gap-3">
                          <span className="text-[8px] md:text-[10px] font-black text-[#E31E24] bg-red-50 px-2.5 py-1 rounded-full uppercase  ">{selectedEmployee.jobTitle}</span>
                          <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase   opacity-60">{selectedEmployee.employeeId}</span>
                        </div>
                      </div>
                      
                      {/* Current Period Summary for Selected Employee */}
                      <div className="hidden lg:flex gap-4">
                        {(() => {
                          const base = selectedEmployee.baseSalary || 0;
                          const s = getEmployeeStats(selectedEmployee.uid, base);
                          const totalDeductions = s.deduction + s.absenceDeduction;
                          return (
                            <>
                              <div className="text-center bg-white p-3 rounded-2xl border border-slate-100 shadow-sm min-w-[80px]">
                                <p className="text-[7px] font-black text-emerald-400 uppercase  er mb-1">مكافآت</p>
                                <p className="text-xs font-black text-emerald-600">+{Math.trunc(s.bonus).toLocaleString()}</p>
                              </div>
                              <div className="text-center bg-white p-3 rounded-2xl border border-slate-100 shadow-sm min-w-[80px]">
                                <p className="text-[7px] font-black text-red-400 uppercase  er mb-1">خصومات</p>
                                <p className="text-xs font-black text-[#E31E24]">-{Math.trunc(totalDeductions).toLocaleString()}</p>
                              </div>
                              <div className="text-center bg-white p-3 rounded-2xl border border-slate-100 shadow-sm min-w-[80px]">
                                <p className="text-[7px] font-black text-orange-400 uppercase  er mb-1">سلف</p>
                                <p className="text-xs font-black text-orange-600">-{Math.trunc(s.advance).toLocaleString()}</p>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {isSupervisorRestriction && (
                      <div className="bg-amber-50 border border-amber-100 rounded-3xl p-6 flex items-center gap-4 mb-8">
                        <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600 flex-shrink-0">
                          <span className="material-symbols-outlined">lock</span>
                        </div>
                        <p className="text-xs font-black text-amber-900 leading-relaxed">بصفتك مشرفاً، لا تملك الصلاحية لتعديل راتبك الخاص أو راتب أي مشرف آخر. يرجى التواصل مع المدير العام لأي تعديلات.</p>
                      </div>
                    )}

                    <div className="space-y-3 md:space-y-4 mb-8 md:mb-12 bg-white p-6 rounded-3xl border border-slate-100/50">
                      <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase   px-2 opacity-60">الراتب الأساسي (IQD)</label>
                      <div className="relative group">
                        <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 transition-transform group-focus-within:scale-110">
                          <span className="material-symbols-outlined text-xl md:text-2xl">account_balance_wallet</span>
                        </div>
                        <input 
                          type="number" 
                          value={baseSalary}
                          onChange={(e) => setBaseSalary(e.target.value)}
                          disabled={isSupervisorRestriction}
                          placeholder="الراتب الأساسي الشهري"
                          className={`w-full pl-12 md:pl-16 pr-6 md:pr-8 py-4 md:py-5 bg-white border border-slate-100 rounded-2xl md:rounded-[28px] focus:outline-none focus:border-[#E31E24] focus:shadow-xl focus:shadow-red-500/5 transition-all font-black text-lg md:text-xl text-slate-900 ${isSupervisorRestriction ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                      </div>
                      <p className="text-[8px] font-bold text-slate-400 px-2 mt-1">تعديل هذا الحقل سيغير الراتب الثابت المخصص لهذا الموظف شهرياً.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 mb-8 md:mb-12">
                      <div className="space-y-3 md:space-y-4">
                        <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase   px-2 opacity-60">إضافة مكافأة (IQD)</label>
                        <div className="relative group">
                          <div className="absolute left-6 top-1/2 -translate-y-1/2 text-green-500 transition-transform group-focus-within:scale-110">
                            <span className="material-symbols-outlined text-xl md:text-2xl">add_circle</span>
                          </div>
                          <input 
                            type="number" 
                            value={bonus}
                            onChange={(e) => setBonus(e.target.value)}
                            placeholder="0.00"
                            className="w-full pl-12 md:pl-16 pr-6 md:pr-8 py-4 md:py-5 bg-white border border-slate-100 rounded-2xl md:rounded-[28px] focus:outline-none focus:border-green-100 focus:bg-white focus:shadow-xl focus:shadow-green-500/5 transition-all font-black text-lg md:text-xl text-slate-900"
                          />
                        </div>
                      </div>

                      <div className="space-y-3 md:space-y-4">
                        <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase   px-2 opacity-60">صرف سلفة (Advance - IQD)</label>
                        <div className="relative group">
                          <div className="absolute left-6 top-1/2 -translate-y-1/2 text-orange-500 transition-transform group-focus-within:scale-110">
                            <span className="material-symbols-outlined text-xl md:text-2xl">payments</span>
                          </div>
                          <input 
                            type="number" 
                            value={advance}
                            onChange={(e) => setAdvance(e.target.value)}
                            placeholder="0.00"
                            className="w-full pl-12 md:pl-16 pr-6 md:pr-8 py-4 md:py-5 bg-white border border-slate-100 rounded-2xl md:rounded-[28px] focus:outline-none focus:border-orange-100 focus:bg-white focus:shadow-xl focus:shadow-orange-500/5 transition-all font-black text-lg md:text-xl text-slate-900"
                          />
                        </div>
                      </div>

                      <div className="space-y-3 md:space-y-4">
                        <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase   px-2 opacity-60">خصم مالي (IQD)</label>
                        <div className="relative group">
                          <div className="absolute left-6 top-1/2 -translate-y-1/2 text-[#E31E24] transition-transform group-focus-within:scale-110">
                            <span className="material-symbols-outlined text-xl md:text-2xl">remove_circle</span>
                          </div>
                          <input 
                            type="number" 
                            value={deduction}
                            onChange={(e) => setDeduction(e.target.value)}
                            placeholder="0.00"
                            className="w-full pl-12 md:pl-16 pr-6 md:pr-8 py-4 md:py-5 bg-white border border-slate-100 rounded-2xl md:rounded-[28px] focus:outline-none focus:border-red-100 focus:bg-white focus:shadow-xl focus:shadow-red-500/5 transition-all font-black text-lg md:text-xl text-slate-900"
                          />
                        </div>
                      </div>

                      <div className="space-y-3 md:space-y-4">
                        <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase   px-2 opacity-60">أجور إضافية (Overtime - IQD)</label>
                        <div className="relative group">
                          <div className="absolute left-6 top-1/2 -translate-y-1/2 text-blue-500 transition-transform group-focus-within:scale-110">
                            <span className="material-symbols-outlined text-xl md:text-2xl">timer</span>
                          </div>
                          <input 
                            type="number" 
                            value={overtime}
                            onChange={(e) => setOvertime(e.target.value)}
                            placeholder="0.00"
                            className="w-full pl-12 md:pl-16 pr-6 md:pr-8 py-4 md:py-5 bg-white border border-slate-100 rounded-2xl md:rounded-[28px] focus:outline-none focus:border-blue-100 focus:bg-white focus:shadow-xl focus:shadow-blue-500/5 transition-all font-black text-lg md:text-xl text-slate-900"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 md:space-y-4 mb-8 md:mb-12">
                      <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase   px-2 opacity-60">السبب أو الملاحظات</label>
                      <textarea 
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="اكتب سبب المكافأة أو الخصم هنا للتوثيق..."
                        rows={4}
                        className="w-full px-6 md:px-8 py-4 md:py-6 bg-white border border-slate-100 rounded-2xl md:rounded-[32px] focus:outline-none focus:border-[#E31E24] focus:bg-white focus:shadow-xl focus:shadow-red-500/5 transition-all font-black text-xs md:text-sm text-right text-slate-700 resize-none leading-relaxed"
                      />
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 md:gap-6">
                      <button 
                        onClick={handleApply}
                        disabled={isSupervisorRestriction}
                        className={`flex-1 py-4 md:py-6 bg-[#E31E24] text-white rounded-2xl md:rounded-[32px] font-black text-base md:text-lg shadow-xl shadow-red-100 hover:bg-red-700 transition-all active:scale-[0.98] uppercase   ${isSupervisorRestriction ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                      >
                        تطبيق التغييرات المالية
                      </button>
                      <button 
                        onClick={() => setSelectedEmployee(null)}
                        className="px-8 md:px-12 py-4 md:py-6 bg-white border-2 border-slate-100 text-slate-400 rounded-2xl md:rounded-[32px] font-black text-[10px] md:text-sm uppercase   hover:bg-slate-50 transition-all active:scale-[0.98]"
                      >
                        إلغاء
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <div className="h-full min-h-[400px] md:min-h-[600px] flex flex-col items-center justify-center text-slate-300 gap-6 md:gap-8 bg-white rounded-[32px] md:rounded-[48px] border-2 border-dashed border-slate-100 opacity-60">
                    <div className="w-16 md:w-24 h-16 md:h-24 bg-slate-50 rounded-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-4xl md:text-6xl">payments</span>
                    </div>
                    <div className="text-center space-y-2 px-6">
                      <h3 className="text-lg md:text-2xl font-black text-slate-400  ">إدارة المستحقات المالية</h3>
                      <p className="text-[9px] md:text-xs font-black uppercase  ">اختر موظفاً من القائمة الجانبية لتعديل راتبه</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="reports"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
                <div className="bg-white p-6 rounded-[32px] border border-slate-50 shadow-sm">
                  <p className="text-[10px] font-black text-emerald-400 uppercase   mb-1">إجمالي الحضور</p>
                  <p className="text-xl font-black text-emerald-600">{totals.attended} <span className="text-xs text-emerald-300">يوم</span></p>
                </div>
                <div className="bg-white p-6 rounded-[32px] border border-slate-50 shadow-sm">
                  <p className="text-[10px] font-black text-red-400 uppercase   mb-1">إجمالي الغياب</p>
                  <p className="text-xl font-black text-[#E31E24]">{totals.absent} <span className="text-xs text-red-300">يوم</span></p>
                </div>
                <div className="bg-white p-6 rounded-[32px] border border-slate-50 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase   mb-1">إجمالي الأساسي</p>
                  <p className="text-xl font-black text-slate-900">{Math.trunc(totals.base).toLocaleString()} <span className="text-xs text-slate-300">د.ع</span></p>
                </div>
                <div className="bg-white p-6 rounded-[32px] border border-slate-50 shadow-sm">
                  <p className="text-[10px] font-black text-emerald-400 uppercase   mb-1">المكافآت</p>
                  <p className="text-xl font-black text-emerald-600">+{Math.trunc(totals.bonus).toLocaleString()} <span className="text-xs text-emerald-300">د.ع</span></p>
                </div>
                <div className="bg-white p-6 rounded-[32px] border border-slate-50 shadow-sm">
                  <p className="text-[10px] font-black text-blue-400 uppercase   mb-1">الإضافي</p>
                  <p className="text-xl font-black text-blue-600">+{Math.trunc(totals.overtime).toLocaleString()} <span className="text-xs text-blue-300">د.ع</span></p>
                </div>
                <div className="bg-white p-6 rounded-[32px] border border-slate-50 shadow-sm">
                  <p className="text-[10px] font-black text-red-400 uppercase   mb-1">الخصومات</p>
                  <p className="text-xl font-black text-[#E31E24]">-{Math.trunc(totals.deduction).toLocaleString()} <span className="text-xs text-red-300">د.ع</span></p>
                </div>
                <div className="bg-white p-6 rounded-[32px] border border-slate-50 shadow-sm">
                  <p className="text-[10px] font-black text-orange-400 uppercase   mb-1">السلف</p>
                  <p className="text-xl font-black text-orange-600">-{Math.trunc(totals.advance).toLocaleString()} <span className="text-xs text-orange-300">د.ع</span></p>
                </div>
                <div className="bg-slate-900 p-6 rounded-[32px] border border-slate-800 shadow-xl shadow-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase   mb-1">الصافي النهائي</p>
                  <p className="text-xl font-black text-white">{Math.trunc(totals.base + totals.bonus + totals.overtime - totals.deduction - totals.advance).toLocaleString()} <span className="text-xs text-white/40">د.ع</span></p>
                </div>
              </div>

              <div className="bg-white/80 backdrop-blur-xl rounded-[32px] md:rounded-[40px] p-6 md:p-8 border border-slate-50 shadow-sm overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500/20 to-transparent"></div>
                <div className="flex items-center justify-between mb-8 px-2">
                  <div className="space-y-1">
                    <h2 className="text-lg md:text-xl font-black text-slate-900  ">تقرير رواتب الموظفين</h2>
                    <p className="text-[9px] font-black text-slate-400 uppercase   opacity-60">كشف الرواتب الصافية بعد المكافآت والخصومات</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={handleExport}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#E31E24] text-white hover:bg-red-700 transition-all shadow-lg shadow-red-100 border border-red-50"
                    >
                      <span className="material-symbols-outlined text-xl">download</span>
                      <span className="text-[10px] font-black uppercase  ">تصدير التقارير</span>
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-right border-separate border-spacing-y-3">
                    <thead>
                      <tr className="text-[10px] font-black text-slate-400 uppercase  ">
                        <th className="pb-4 pr-6 text-right">الموظف</th>
                        <th className="pb-4 px-4 text-center">الحضور/الغياب</th>
                        <th className="pb-4 px-4 text-center">الراتب الأساسي</th>
                        <th className="pb-4 px-4 text-center">المكافآت</th>
                        <th className="pb-4 px-4 text-center">الإضافي</th>
                        <th className="pb-4 px-4 text-center">السلف</th>
                        <th className="pb-4 px-4 text-center">خصومات</th>
                        <th className="pb-4 px-4 text-center whitespace-nowrap">خصم الغياب</th>
                        <th className="pb-4 pl-6 text-left">الصافي النهائي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map(emp => {
                        const base = emp.baseSalary || 0;
                        const stats = getEmployeeStats(emp.uid, base);
                        
                        const bonusVal = stats.bonus;
                        const advanceVal = stats.advance;
                        const deductionVal = stats.deduction;
                        const absenceDeductionVal = stats.absenceDeduction;
                        const overtimeVal = stats.overtime;
                        const net = base + bonusVal + overtimeVal - deductionVal - absenceDeductionVal - advanceVal;
                        
                        return (
                          <tr key={emp.uid} className="group hover:bg-slate-50/50 transition-colors">
                            <td className="py-4 pr-6 rounded-r-3xl bg-slate-50/30 group-hover:bg-white border-y border-r border-slate-50/50 group-hover:border-slate-100 transition-all">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm flex-shrink-0">
                                  <img src={emp.profileImageUrl || `https://ui-avatars.com/api/?name=${emp.displayName}`} alt="" className="w-full h-full object-cover" />
                                </div>
                                <div>
                                  <p className="text-xs font-black text-slate-900 leading-none mb-1">{emp.displayName}</p>
                                  <p className="text-[9px] font-bold text-slate-400 uppercase   opacity-60">{emp.jobTitle}</p>
                                </div>
                              </div>
                            </td>
                            <td 
                              onClick={() => setEditingAttendanceUser(emp)}
                              className="py-4 px-4 text-center bg-slate-50/30 group-hover:bg-white border-y border-slate-50/50 group-hover:border-slate-100 transition-all cursor-pointer hover:bg-slate-100/50"
                            >
                              <div className="flex flex-col items-center">
                                <span className="text-[10px] font-black text-emerald-500">{(attendanceStats[emp.uid]?.attended || 0)} ح</span>
                                <span className="text-[10px] font-black text-[#E31E24]">{(attendanceStats[emp.uid]?.absent || 0)} غ</span>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-center bg-slate-50/30 group-hover:bg-white border-y border-slate-50/50 group-hover:border-slate-100 transition-all">
                              <span className="text-xs font-black text-slate-600">{Math.trunc(base).toLocaleString()}</span>
                              <span className="text-[8px] font-bold text-slate-300 mr-1 uppercase">د.ع</span>
                            </td>
                            <td className="py-4 px-4 text-center bg-slate-50/30 group-hover:bg-white border-y border-slate-50/50 group-hover:border-slate-100 transition-all">
                              <span className={`text-xs font-black ${bonusVal > 0 ? 'text-emerald-500' : 'text-slate-300'}`}>
                                {bonusVal > 0 ? `+${Math.trunc(bonusVal).toLocaleString()}` : '0'}
                              </span>
                              {bonusVal > 0 && <span className="text-[8px] font-bold text-emerald-300 mr-1 uppercase">د.ع</span>}
                            </td>
                            <td className="py-4 px-4 text-center bg-slate-50/30 group-hover:bg-white border-y border-slate-50/50 group-hover:border-slate-100 transition-all">
                              <span className={`text-xs font-black ${overtimeVal > 0 ? 'text-blue-500' : 'text-slate-300'}`}>
                                {overtimeVal > 0 ? `+${Math.trunc(overtimeVal).toLocaleString()}` : '0'}
                              </span>
                              {overtimeVal > 0 && <span className="text-[8px] font-bold text-blue-300 mr-1 uppercase">د.ع</span>}
                            </td>
                            <td className="py-4 px-4 text-center bg-slate-50/30 group-hover:bg-white border-y border-slate-50/50 group-hover:border-slate-100 transition-all">
                              <span className={`text-xs font-black ${advanceVal > 0 ? 'text-orange-500' : 'text-slate-300'}`}>
                                {advanceVal > 0 ? `-${Math.trunc(advanceVal).toLocaleString()}` : '0'}
                              </span>
                              {advanceVal > 0 && <span className="text-[8px] font-bold text-orange-300 mr-1 uppercase">د.ع</span>}
                            </td>
                            <td className="py-4 px-4 text-center bg-slate-50/30 group-hover:bg-white border-y border-slate-50/50 group-hover:border-slate-100 transition-all">
                              <span className={`text-xs font-black ${deductionVal > 0 ? 'text-[#E31E24]' : 'text-slate-300'}`}>
                                {deductionVal > 0 ? `-${Math.trunc(deductionVal).toLocaleString()}` : '0'}
                              </span>
                              {deductionVal > 0 && <span className="text-[8px] font-bold text-red-300 mr-1 uppercase">د.ع</span>}
                            </td>
                            <td className="py-4 px-4 text-center bg-slate-50/30 group-hover:bg-white border-y border-slate-50/50 group-hover:border-slate-100 transition-all">
                              <span className={`text-xs font-black ${absenceDeductionVal > 0 ? 'text-red-400' : 'text-slate-300'}`}>
                                {absenceDeductionVal > 0 ? `-${Math.trunc(absenceDeductionVal).toLocaleString()}` : '0'}
                              </span>
                              {absenceDeductionVal > 0 && <span className="text-[8px] font-bold text-red-200 mr-1 uppercase">د.ع</span>}
                            </td>
                            <td className="py-4 pl-6 text-left rounded-l-3xl bg-slate-50/30 group-hover:bg-white border-y border-l border-slate-50/50 group-hover:border-slate-100 transition-all">
                              <div className="flex flex-col items-start">
                                <div className="flex items-baseline gap-1">
                                  <span className="text-sm font-black text-slate-900  ">{Math.trunc(net).toLocaleString()}</span>
                                  <span className="text-[9px] font-black text-[#E31E24] uppercase">د.ع</span>
                                </div>
                                <div className="w-16 h-1 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, (net / 2000000) * 100)}%` }}
                                    className="h-full bg-emerald-500 rounded-full"
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* Attendance Edit Modal */}
      <AnimatePresence>
        {editingAttendanceUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingAttendanceUser(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[40px] w-full max-w-lg p-8 shadow-2xl relative z-10 max-h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-600">
                    <span className="material-symbols-outlined">calendar_month</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">تعديل سجل الحضور</h3>
                    <p className="text-xs font-black text-slate-400">{editingAttendanceUser.displayName}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setEditingAttendanceUser(null)}
                  className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-slate-200 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>

              <div className="flex-1 space-y-8">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase px-2 text-right block">تاريخ التسجيل</label>
                    <input 
                      type="date"
                      value={modalDate}
                      onChange={(e) => setModalDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-black text-lg focus:outline-none focus:border-red-500 text-center"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase px-2 text-right block">حالة الحضور</label>
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => setModalStatus('present')}
                        className={`py-4 rounded-2xl font-black text-sm transition-all border-2 ${
                          modalStatus === 'present' 
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-600 shadow-lg shadow-emerald-100' 
                            : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                        }`}
                      >
                        حاضر
                      </button>
                      <button 
                        onClick={() => setModalStatus('absent')}
                        className={`py-4 rounded-2xl font-black text-sm transition-all border-2 ${
                          modalStatus === 'absent' 
                            ? 'bg-red-50 border-red-500 text-red-600 shadow-lg shadow-red-100' 
                            : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                        }`}
                      >
                        غائب
                      </button>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={handleSaveAttendance}
                  disabled={syncing || !modalDate}
                  className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-sm shadow-xl shadow-slate-200 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {syncing ? 'جاري الحفظ والمزامنة...' : 'تحديث البيانات والمزامنة'}
                </button>
              </div>
              
              <div className="mt-8 pt-6 border-t border-slate-100">
                <p className="text-[10px] font-black text-slate-400 text-center uppercase tracking-widest">
                  سيتم تحديث الراتب والمزامنة مع نظام الموظف تلقائياً
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
