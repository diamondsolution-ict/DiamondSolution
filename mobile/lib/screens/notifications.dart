import 'package:flutter/material.dart';
import '../core/supabase.dart';
import '../core/theme.dart';

class NotificationsButton extends StatefulWidget {
  const NotificationsButton({super.key});
  @override
  State<NotificationsButton> createState() => _NotificationsButtonState();
}

class _NotificationsButtonState extends State<NotificationsButton> {
  int unread = 0;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    try {
      final rows = await db.from('notifications').select('id').eq('read', false);
      if (mounted) setState(() => unread = (rows as List).length);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) => IconButton(
        icon: Badge(
          isLabelVisible: unread > 0,
          label: Text('$unread'),
          child: const Icon(Icons.notifications_outlined, color: AppColors.text3),
        ),
        onPressed: () async {
          await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NotificationsScreen()));
          _refresh();
        },
      );
}

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});
  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<Map<String, dynamic>>? items;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final rows = await db
        .from('notifications')
        .select('id, title, body, read, created_at')
        .order('created_at', ascending: false)
        .limit(50);
    if (mounted) setState(() => items = List<Map<String, dynamic>>.from(rows));
  }

  Future<void> _markAll() async {
    await db.rpc('mark_all_notifications_read');
    _load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('Notifications'),
          actions: [TextButton(onPressed: _markAll, child: const Text('Mark all read', style: TextStyle(color: Colors.white)))],
        ),
        body: items == null
            ? const Center(child: CircularProgressIndicator())
            : items!.isEmpty
                ? const Center(child: Text('Nothing here yet.'))
                : ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: items!.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, i) {
                      final n = items![i];
                      final read = n['read'] == true;
                      return Card(
                        child: ListTile(
                          leading: Icon(read ? Icons.notifications_none : Icons.notifications_active, color: read ? AppColors.text3 : AppColors.royal),
                          title: Text(n['title'] as String, style: TextStyle(fontWeight: read ? FontWeight.normal : FontWeight.bold)),
                          subtitle: Text(n['body'] as String),
                          onTap: read
                              ? null
                              : () async {
                                  await db.rpc('mark_notification_read', params: {'p_notification_id': n['id']});
                                  _load();
                                },
                        ),
                      );
                    },
                  ),
      );
}
