import 'package:flutter/material.dart';
import '../../core/supabase.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import 'admin_common.dart';

// Mirrors src/pages/admin/AdminAuditLog.tsx (System Logs).
class AdminAuditScreen extends StatefulWidget {
  const AdminAuditScreen({super.key});
  @override
  State<AdminAuditScreen> createState() => _AdminAuditScreenState();
}

class _AdminAuditScreenState extends State<AdminAuditScreen> {
  List<Map<String, dynamic>> rows = [];
  Map<String, String> names = {};
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final data = List<Map<String, dynamic>>.from(await db.from('admin_actions_log').select('id, actor_user_id, action, target_table, target_id, reason, created_at').order('created_at', ascending: false).limit(200));
    final ids = {for (final r in data) r['actor_user_id'] as String}.toList();
    if (ids.isNotEmpty) {
      final p = await selectIn('profiles', 'user_id, display_name', 'user_id', ids);
      names = {for (final x in p) x['user_id'] as String: (x['display_name'] as String?) ?? 'Unknown'};
    }
    if (mounted) {
      setState(() {
        rows = data;
        loading = false;
      });
    }
  }

  String _stamp(String iso) {
    final d = DateTime.parse(iso).toLocal();
    String t(int n) => n.toString().padLeft(2, '0');
    return '${d.year}-${t(d.month)}-${t(d.day)} ${t(d.hour)}:${t(d.minute)}:${t(d.second)}';
  }

  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(20), children: [
        Row(children: [const Icon(Icons.receipt_long_outlined, size: 22, color: AppColors.royal), const SizedBox(width: 8), Text('Audit Log', style: heading(24))]),
        const SizedBox(height: 4),
        Text('Every withdrawal-affecting admin action, who did it, and when.', style: body(14, color: AppColors.text3)),
        const SizedBox(height: 16),
        if (loading)
          Text('Loading…', style: body(14, color: AppColors.text3))
        else if (rows.isEmpty)
          const EmptyCard(icon: Icons.history, message: 'No admin actions logged yet.')
        else
          for (final r in rows)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: CardLuxury(
                padding: const EdgeInsets.all(16),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Container(width: 32, height: 32, alignment: Alignment.center, decoration: const BoxDecoration(color: AppColors.royalSoft, shape: BoxShape.circle), child: Text((names[r['actor_user_id']] ?? '?').substring(0, 1).toUpperCase(), style: body(12, weight: FontWeight.w700, color: AppColors.royal))),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text.rich(TextSpan(children: [
                        TextSpan(text: '${names[r['actor_user_id']] ?? 'Unknown'} ', style: body(14, weight: FontWeight.w600)),
                        TextSpan(text: '— ${'${r['action']}'.replaceAll('_', ' ')}', style: body(14, color: AppColors.text3)),
                      ])),
                      Text(_stamp(r['created_at'] as String), style: body(12, color: AppColors.text3)),
                      if (r['target_table'] != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text('${r['target_table']}:${r['target_id']}', style: body(12, color: AppColors.text3).copyWith(fontFamily: 'monospace'))),
                      if (r['reason'] != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text('${r['reason']}', style: body(12, color: AppColors.text2))),
                    ]),
                  ),
                ]),
              ),
            ),
        const SizedBox(height: 80),
      ]);
}
