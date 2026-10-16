import 'package:flutter/material.dart';
import '../../core/supabase.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import 'admin_common.dart';

// Mirrors src/pages/admin/AdminNotifications.tsx.
class AdminNotificationsScreen extends StatefulWidget {
  const AdminNotificationsScreen({super.key});
  @override
  State<AdminNotificationsScreen> createState() => _AdminNotificationsScreenState();
}

class _AdminNotificationsScreenState extends State<AdminNotificationsScreen> {
  final title = TextEditingController();
  final bodyCtl = TextEditingController();
  List<Map<String, dynamic>> history = [];
  bool loading = true;
  bool sending = false;
  String? error;
  String? info;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final rows = await db.from('admin_broadcasts').select('id, title, body, recipient_count, created_at').order('created_at', ascending: false).limit(50);
    if (mounted) {
      setState(() {
        history = List<Map<String, dynamic>>.from(rows);
        loading = false;
      });
    }
  }

  Future<void> _send() async {
    setState(() {
      error = null;
      info = null;
    });
    if (title.text.trim().isEmpty || bodyCtl.text.trim().isEmpty) {
      setState(() => error = 'Title and message are both required.');
      return;
    }
    setState(() => sending = true);
    try {
      await db.rpc('broadcast_notification', params: {'p_title': title.text.trim(), 'p_body': bodyCtl.text.trim()});
      title.clear();
      bodyCtl.clear();
      info = 'Broadcast sent.';
      await _load();
    } catch (e) {
      error = '$e';
    }
    if (mounted) setState(() => sending = false);
  }

  Future<void> _revoke(String id) async {
    if (!await confirmDialog(context, 'Remove this broadcast from the history log?')) return;
    setState(() => history.removeWhere((b) => b['id'] == id));
    await db.from('admin_broadcasts').delete().eq('id', id);
  }

  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(20), children: [
        CardLuxury(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [const Icon(Icons.notifications_none, size: 18, color: AppColors.royal), const SizedBox(width: 8), Text('Compose broadcast', style: heading(16))]),
            const SizedBox(height: 16),
            const FieldLabel('Title'),
            TextField(controller: title, decoration: const InputDecoration(hintText: 'Announcement title…')),
            const SizedBox(height: 12),
            const FieldLabel('Message'),
            TextField(controller: bodyCtl, minLines: 4, maxLines: 4, decoration: const InputDecoration(hintText: 'Message to every student…')),
            if (error != null) ...[const SizedBox(height: 12), Banner2(error!)],
            if (info != null) ...[const SizedBox(height: 12), Banner2(info!, success: true)],
            const SizedBox(height: 12),
            BtnPrimary(label: sending ? 'Sending…' : 'Broadcast to all users', onPressed: sending ? null : _send),
            const SizedBox(height: 12),
            Text('No per-user targeting or scheduling — this sends immediately to every registered user.', style: body(12, color: AppColors.text3)),
          ]),
        ),
        const SizedBox(height: 16),
        CardLuxury(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('History', style: heading(16)),
            const SizedBox(height: 12),
            if (loading)
              Text('Loading…', style: body(14, color: AppColors.text3))
            else if (history.isEmpty)
              Text('No broadcasts sent yet.', style: body(14, color: AppColors.text3))
            else
              for (final b in history)
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${b['title']}', style: body(14, weight: FontWeight.w600)),
                          const SizedBox(height: 2),
                          Text('${b['body']}', maxLines: 3, overflow: TextOverflow.ellipsis, style: body(12, color: AppColors.text3)),
                        ]),
                      ),
                      GestureDetector(onTap: () => _revoke(b['id'] as String), child: const Padding(padding: EdgeInsets.all(6), child: Icon(Icons.delete_outline, size: 14, color: AppColors.text3))),
                    ]),
                    const SizedBox(height: 8),
                    Text('Sent to ${b['recipient_count']} users · ${fmtDateTime(b['created_at'] as String)}', style: body(11, color: AppColors.text3)),
                  ]),
                ),
          ]),
        ),
        const SizedBox(height: 80),
      ]);
}
