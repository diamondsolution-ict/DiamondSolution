import 'package:flutter/material.dart';
import '../core/supabase.dart';
import '../core/theme.dart';
import '../core/time_ago.dart';

// Mirrors src/components/NotificationBell.tsx: a bell with a gold unread badge that opens a
// dropdown panel under the header.
class NotificationsButton extends StatefulWidget {
  const NotificationsButton({super.key});
  @override
  State<NotificationsButton> createState() => _NotificationsButtonState();
}

class _NotificationsButtonState extends State<NotificationsButton> {
  List<Map<String, dynamic>> items = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final rows = await db.from('notifications').select('id, type, title, body, read, created_at').order('created_at', ascending: false).limit(20);
      if (mounted) setState(() => items = List<Map<String, dynamic>>.from(rows));
    } catch (_) {}
  }

  int get unread => items.where((n) => n['read'] != true).length;

  Future<void> _open() async {
    await _load(); // refetch on open, like the website
    if (!mounted) return;
    await showGeneralDialog<void>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Notifications',
      barrierColor: Colors.transparent,
      transitionDuration: const Duration(milliseconds: 120),
      pageBuilder: (ctx, _, __) => _Panel(
        items: items,
        onMarkOne: (id) async {
          setState(() => items = [for (final n in items) n['id'] == id ? {...n, 'read': true} : n]);
          await db.rpc('mark_notification_read', params: {'p_notification_id': id});
        },
        onMarkAll: () async {
          setState(() => items = [for (final n in items) {...n, 'read': true}]);
          await db.rpc('mark_all_notifications_read');
        },
      ),
    );
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final count = unread;
    return IconButton(
      tooltip: 'Notifications',
      onPressed: _open,
      icon: Stack(clipBehavior: Clip.none, children: [
        const Icon(Icons.notifications_none, size: 22, color: AppColors.text3),
        if (count > 0)
          Positioned(
            top: -4,
            right: -6,
            child: Container(
              constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
              padding: const EdgeInsets.symmetric(horizontal: 4),
              alignment: Alignment.center,
              decoration: BoxDecoration(color: AppColors.gold, borderRadius: BorderRadius.circular(99)),
              child: Text(count > 9 ? '9+' : '$count', style: body(10, weight: FontWeight.w700, color: AppColors.navy)),
            ),
          ),
      ]),
    );
  }
}

class _Panel extends StatefulWidget {
  const _Panel({required this.items, required this.onMarkOne, required this.onMarkAll});
  final List<Map<String, dynamic>> items;
  final Future<void> Function(String id) onMarkOne;
  final Future<void> Function() onMarkAll;
  @override
  State<_Panel> createState() => _PanelState();
}

class _PanelState extends State<_Panel> {
  late List<Map<String, dynamic>> items = widget.items;

  @override
  Widget build(BuildContext context) {
    final unread = items.where((n) => n['read'] != true).length;
    final top = MediaQuery.of(context).padding.top + kToolbarHeight + 4;
    return Stack(children: [
      Positioned(
        top: top,
        right: 12,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: 320, maxHeight: MediaQuery.of(context).size.height * 0.6),
          child: SizedBox(
            width: MediaQuery.of(context).size.width * 0.85 > 320 ? 320 : MediaQuery.of(context).size.width * 0.85,
            child: Material(
              color: Colors.white,
              elevation: 8,
              shadowColor: Colors.black26,
              borderRadius: BorderRadius.circular(16),
              clipBehavior: Clip.antiAlias,
              child: Container(
                decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(16)),
                child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                      Text('Notifications', style: heading(14)),
                      if (unread > 0)
                        GestureDetector(
                          onTap: () async {
                            setState(() => items = [for (final n in items) {...n, 'read': true}]);
                            await widget.onMarkAll();
                          },
                          child: Text('Mark all read', style: body(12, weight: FontWeight.w600, color: AppColors.royal)),
                        ),
                    ]),
                  ),
                  const Divider(height: 1, color: AppColors.border),
                  Flexible(
                    child: items.isEmpty
                        ? Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24), child: Text('No notifications yet.', textAlign: TextAlign.center, style: body(14, color: AppColors.text3)))
                        : ListView.separated(
                            shrinkWrap: true,
                            padding: EdgeInsets.zero,
                            itemCount: items.length,
                            separatorBuilder: (_, __) => const Divider(height: 1, color: AppColors.border),
                            itemBuilder: (context, i) {
                              final n = items[i];
                              final read = n['read'] == true;
                              return InkWell(
                                onTap: read
                                    ? null
                                    : () async {
                                        setState(() => items = [for (final x in items) x['id'] == n['id'] ? {...x, 'read': true} : x]);
                                        await widget.onMarkOne(n['id'] as String);
                                      },
                                child: Container(
                                  color: read ? Colors.white : AppColors.royalSoft.withValues(alpha: 0.4),
                                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                    Text(n['title'] as String, style: body(14, weight: FontWeight.w600)),
                                    const SizedBox(height: 2),
                                    Text(n['body'] as String, style: body(12, color: AppColors.text3)),
                                    const SizedBox(height: 4),
                                    Text(timeAgo(DateTime.parse(n['created_at'] as String).toLocal()), style: body(10, color: AppColors.text3)),
                                  ]),
                                ),
                              );
                            },
                          ),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ),
    ]);
  }
}
