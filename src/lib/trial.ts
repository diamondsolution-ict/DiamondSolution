// Shared shape for trial_status() (see 20261106000000_free_trial_and_optional_referral.sql) —
// a 14-day, account-wide free trial for a student with no real (paid or admin-exempted)
// department access yet: full read access to every department, capped at a few "theory"
// (application-type) and more "objective"-type questions actually answered per day. Used
// anywhere a page needs to know whether to treat a student as trial-eligible before they've
// ever paid for anything (CourseList, CourseDetail, StudyPage).
import { supabase } from "@/lib/supabase";

export interface TrialStatus {
  in_trial: boolean;
  days_left?: number;
  theory_used?: number;
  theory_limit?: number;
  objective_used?: number;
  objective_limit?: number;
}

const NOT_IN_TRIAL: TrialStatus = { in_trial: false };

export async function fetchTrialStatus(): Promise<TrialStatus> {
  const { data, error } = await supabase.rpc("trial_status");
  if (error || !data) return NOT_IN_TRIAL;
  return data as TrialStatus;
}
