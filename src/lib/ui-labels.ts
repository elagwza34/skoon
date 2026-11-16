const labels: Record<string, string> = {
  employees: 'الموظفون', activeEmployees: 'الموظفون النشطون', presentToday: 'الحضور اليوم', pendingApprovals: 'طلبات تنتظر الموافقة',
  totalPayroll: 'إجمالي الرواتب', paidPayroll: 'الرواتب المدفوعة', outstandingPayroll: 'الرواتب المتبقية',
  scheduledMinutes: 'دقائق العمل المجدولة', actualMinutes: 'دقائق العمل الفعلية', payableMinutes: 'الدقائق المستحقة',
  missingMinutes: 'دقائق العجز', lateMinutes: 'دقائق التأخير', earlyDepartureMinutes: 'دقائق الانصراف المبكر',
  extraMinutes: 'دقائق العمل الإضافي', restDayWorkMinutes: 'العمل في أيام الراحة بالدقائق', holidayWorkMinutes: 'العمل في العطلات بالدقائق',
  approvedLeaveMinutes: 'دقائق الإجازة المعتمدة', paidLeaveMinutes: 'دقائق الإجازة المدفوعة', overnightWorkMinutes: 'دقائق العمل الليلي',
  active: 'نشط', inactive: 'غير نشط', archived: 'مؤرشف', terminated: 'انتهت الخدمة', pending: 'قيد المراجعة', approved: 'معتمد', rejected: 'مرفوض', cancelled: 'ملغي',
  regular: 'يوم عادي', rest_day: 'يوم راحة', holiday: 'عطلة رسمية', night: 'ليلي',
  annual: 'سنوية', sick: 'مرضية', unpaid: 'بدون أجر', emergency: 'طارئة', paid: 'مدفوعة',
  permanent: 'دائم', temporary: 'مؤقت', fixed_term: 'محدد المدة', indefinite: 'غير محدد المدة',
  monthly: 'شهري', daily: 'يومي', hourly: 'بالساعة', per_shift: 'بالوردية', weekly: 'أسبوعي', semi_monthly: 'نصف شهري',
  national_id_front: 'الرقم القومي — أمامي', national_id_back: 'الرقم القومي — خلفي', signed_contract: 'عقد موقّع', other: 'مستند آخر',
}

export const uiLabel = (key: unknown) => labels[String(key)] ?? (/[\u0600-\u06ff]/.test(String(key)) ? String(key) : 'غير محدد')
export const arabicError = (error: unknown, fallback: string) => error instanceof Error && /[\u0600-\u06ff]/.test(error.message) ? error.message : fallback
