export interface CarePatient { id:number; name:string; mrn:string; status:string }
export interface PrescriptionItem { medicine:string; strength:string; dose:string; route:string; frequency:string; duration_days:number; quantity:number; instructions:string }
export interface PrescriptionRecord { id:number; patient_id:number; status:string; version:number; items:PrescriptionItem[]; provider_name:string; registration_number:string|null; author_user_id:number|null; issued_at:string|null; cancelled_at:string|null; cancel_reason:string|null; created_at:string; patient?:{id:number; mrn:string; contact:{name:string|null}} }
export interface ProblemRecord { id:number; name:string; code:string|null; onset_date:string|null; status:string; notes:string|null; version:number }
export interface AllergyRecord { id:number; allergen:string; reaction:string; severity:string; status:string; version:number; inactive_reason?:string|null }
export const emptyPrescriptionItem=():PrescriptionItem=>({medicine:'',strength:'',dose:'',route:'',frequency:'',duration_days:7,quantity:1,instructions:''});
