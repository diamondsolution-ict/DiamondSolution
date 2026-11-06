import 'package:flutter/material.dart';
import 'supabase.dart';
import 'theme.dart';

/// Mirrors src/lib/trial.ts: the result of the trial_status() RPC (a 14-day, account-wide free
/// trial for students with no paid or admin-granted access yet, capped per day).
class TrialStatus {
  const TrialStatus({this.inTrial = false, this.daysLeft = 0, this.theoryUsed = 0, this.theoryLimit = 0, this.objectiveUsed = 0, this.objectiveLimit = 0});
  final bool inTrial;
  final int daysLeft, theoryUsed, theoryLimit, objectiveUsed, objectiveLimit;

  static const none = TrialStatus();

  String get daysLabel => '$daysLeft day${daysLeft == 1 ? '' : 's'} left';

  factory TrialStatus.fromJson(Map<String, dynamic> j) => TrialStatus(
        inTrial: j['in_trial'] == true,
        daysLeft: (j['days_left'] as num?)?.toInt() ?? 0,
        theoryUsed: (j['theory_used'] as num?)?.toInt() ?? 0,
        theoryLimit: (j['theory_limit'] as num?)?.toInt() ?? 0,
        objectiveUsed: (j['objective_used'] as num?)?.toInt() ?? 0,
        objectiveLimit: (j['objective_limit'] as num?)?.toInt() ?? 0,
      );
}

/// Never throws: a failed lookup just means "no trial", which falls back to the normal paywall.
Future<TrialStatus> fetchTrialStatus() async {
  try {
    final r = await db.rpc('trial_status');
    if (r is Map) return TrialStatus.fromJson(Map<String, dynamic>.from(r));
  } catch (_) {}
  return TrialStatus.none;
}

/// Blue "Free trial" strip. [onUnlock] adds the "Unlock full access" button (department screens);
/// [detailed] adds today's used/limit counters.
class TrialBanner extends StatelessWidget {
  const TrialBanner({super.key, required this.trial, this.detailed = true, this.onUnlock});
  final TrialStatus trial;
  final bool detailed;
  final VoidCallback? onUnlock;

  @override
  Widget build(BuildContext context) {
    final text = detailed
        ? 'Free trial — ${trial.daysLabel}. Today: ${trial.theoryUsed}/${trial.theoryLimit} theory · ${trial.objectiveUsed}/${trial.objectiveLimit} objective questions used.'
        : 'Free trial — ${trial.daysLabel}. Open any department below to browse and practice, up to ${trial.theoryLimit} theory and ${trial.objectiveLimit} objective questions a day.';
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: AppColors.royalSoft, border: Border.all(color: AppColors.royalBorder), borderRadius: BorderRadius.circular(16)),
        child: Row(children: [
          const Icon(Icons.card_giftcard, size: 16, color: AppColors.royal),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: body(12, weight: FontWeight.w600, color: AppColors.text2))),
          if (onUnlock != null) ...[const SizedBox(width: 8), TextButton(onPressed: onUnlock, child: const Text('Unlock full access'))],
        ]),
      ),
    );
  }
}
