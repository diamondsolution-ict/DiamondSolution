import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/supabase.dart';
import '../../core/theme.dart';
import '../../core/time_ago.dart';
import 'admin_common.dart';

// Mirrors src/pages/admin/AdminSupport.tsx: thread list -> conversation (one pane at a time on a phone).
class AdminSupportScreen extends StatefulWidget {
  const AdminSupportScreen({super.key});
  @override
  State<AdminSupportScreen> createState() => _AdminSupportScreenState();
}

class _AdminSupportScreenState extends State<AdminSupportScreen> {
  List<Map<String, dynamic>> threads = [];
  List<Map<String, dynamic>> messages = [];
  String? activeId;
  bool loading = true;
  bool sending = false;
  bool unlocking = false;
  final draft = TextEditingController();
  final scroll = ScrollController();
  RealtimeChannel? channel;

  @override
  void initState() {
    super.initState();
    _loadThreads();
    channel = db
        .channel('admin-support-inbox')
        .onPostgresChanges(event: PostgresChangeEvent.insert, schema: 'public', table: 'chat_messages', callback: (p) => _onInsert(p.newRecord))
        .subscribe();
  }

  @override
  void dispose() {
    if (channel != null) db.removeChannel(channel!);
    super.dispose();
  }

  Future<void> _loadThreads() async {
    final rows = List<Map<String, dynamic>>.from(await db.from('chat_threads').select('id, user_id, admin_unread_count, last_message_at').order('last_message_at', ascending: false));
    final ids = rows.map((t) => t['user_id'] as String).toList();
    final names = <String, Map<String, dynamic>>{};
    final emails = <String, String>{};
    if (ids.isNotEmpty) {
      final r = await Future.wait<dynamic>([
        selectIn('profiles', 'user_id, display_name, device_block_started_at', 'user_id', ids),
        emailsFor(ids),
      ]);
      for (final p in r[0] as List) {
        names[p['user_id'] as String] = Map<String, dynamic>.from(p as Map);
      }
      emails.addAll(r[1] as Map<String, String>);
    }
    if (!mounted) return;
    setState(() {
      threads = [
        for (final t in rows) {...t, 'display_name': names[t['user_id']]?['display_name'], 'email': emails[t['user_id']], 'device_block_started_at': names[t['user_id']]?['device_block_started_at']}
      ];
      loading = false;
    });
  }

  void _onInsert(Map<String, dynamic> row) {
    final idx = threads.indexWhere((t) => t['id'] == row['thread_id']);
    if (idx == -1) {
      _loadThreads();
    } else {
      final cur = threads[idx];
      final bump = row['sender_role'] == 'student' && row['thread_id'] != activeId;
      setState(() {
        threads[idx] = {...cur, 'last_message_at': row['created_at'], 'admin_unread_count': (cur['admin_unread_count'] as int) + (bump ? 1 : 0)};
        threads.sort((a, b) => DateTime.parse(b['last_message_at'] as String).compareTo(DateTime.parse(a['last_message_at'] as String)));
      });
    }
    if (row['thread_id'] == activeId && !messages.any((m) => m['id'] == row['id'])) {
      setState(() => messages.add(row));
      _toEnd();
      if (row['sender_role'] == 'student') db.rpc('mark_chat_thread_read_by_admin', params: {'p_thread_id': row['thread_id']});
    }
  }

  void _toEnd() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (scroll.hasClients) scroll.jumpTo(scroll.position.maxScrollExtent);
      });

  Future<void> _open(String id) async {
    setState(() => activeId = id);
    final rows = await db.from('chat_messages').select('id, sender_role, body, created_at').eq('thread_id', id).order('created_at', ascending: true);
    if (!mounted) return;
    setState(() => messages = List<Map<String, dynamic>>.from(rows));
    _toEnd();
    await db.rpc('mark_chat_thread_read_by_admin', params: {'p_thread_id': id});
    if (mounted) setState(() => threads = [for (final t in threads) t['id'] == id ? {...t, 'admin_unread_count': 0} : t]);
  }

  Future<void> _send() async {
    final text = draft.text.trim();
    if (text.isEmpty || activeId == null || sending) return;
    setState(() => sending = true);
    draft.clear();
    await db.rpc('send_chat_message_as_admin', params: {'p_thread_id': activeId, 'p_body': text});
    if (mounted) setState(() => sending = false);
  }

  Future<void> _unlock(String userId) async {
    setState(() => unlocking = true);
    try {
      await db.rpc('admin_unlock_device', params: {'p_user_id': userId});
      setState(() => threads = [for (final t in threads) t['user_id'] == userId ? {...t, 'device_block_started_at': null} : t]);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Unlock failed: ${e is PostgrestException ? e.message : e}')));
    }
    if (mounted) setState(() => unlocking = false);
  }

  @override
  Widget build(BuildContext context) {
    Map<String, dynamic>? active;
    for (final t in threads) {
      if (t['id'] == activeId) active = t;
    }
    return PopScope(
      canPop: active == null,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) setState(() => activeId = null);
      },
      child: active == null ? _list() : _conversation(active),
    );
  }

  Widget _list() => ListView(padding: const EdgeInsets.all(20), children: [
        const AdminHeading('Support', subtitle: 'Live conversations with scholars. Replies are posted as "Support" to the student\'s Chat tab.'),
        const SizedBox(height: 16),
        Container(
          decoration: BoxDecoration(color: Colors.white, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(16)),
          clipBehavior: Clip.antiAlias,
          child: loading
              ? Padding(padding: const EdgeInsets.all(16), child: Text('Loading…', style: body(14, color: AppColors.text3)))
              : threads.isEmpty
                  ? Padding(padding: const EdgeInsets.all(16), child: Text('No conversations yet.', style: body(14, color: AppColors.text3)))
                  : Column(children: [
                      for (final t in threads)
                        InkWell(
                          onTap: () => _open(t['id'] as String),
                          child: Container(
                            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.border))),
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Row(children: [
                                Expanded(child: Text((t['display_name'] as String?)?.isNotEmpty == true ? t['display_name'] as String : (t['email'] as String? ?? 'Scholar'), maxLines: 1, overflow: TextOverflow.ellipsis, style: body(14, weight: FontWeight.w600))),
                                if (t['device_block_started_at'] != null) Container(width: 20, height: 20, margin: const EdgeInsets.only(left: 4), decoration: const BoxDecoration(color: Color(0xFFFFE4E6), shape: BoxShape.circle), child: const Icon(Icons.lock_open, size: 11, color: Color(0xFFE11D48))),
                                if ((t['admin_unread_count'] as int) > 0)
                                  Container(
                                    constraints: const BoxConstraints(minWidth: 20),
                                    height: 20,
                                    margin: const EdgeInsets.only(left: 4),
                                    padding: const EdgeInsets.symmetric(horizontal: 4),
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(color: AppColors.royal, borderRadius: BorderRadius.circular(99)),
                                    child: Text('${t['admin_unread_count']}', style: body(10, weight: FontWeight.w700, color: Colors.white)),
                                  ),
                              ]),
                              Text('${t['email'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: body(12, color: AppColors.text3)),
                              Padding(padding: const EdgeInsets.only(top: 2), child: Text(timeAgo(DateTime.parse(t['last_message_at'] as String)), style: body(10, color: AppColors.text3))),
                            ]),
                          ),
                        ),
                    ]),
        ),
        const SizedBox(height: 80),
      ]);

  Widget _conversation(Map<String, dynamic> t) => Column(children: [
        Container(
          decoration: const BoxDecoration(color: Colors.white, border: Border(bottom: BorderSide(color: AppColors.border))),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(children: [
            IconButton(icon: const Icon(Icons.arrow_back, size: 18, color: AppColors.text3), onPressed: () => setState(() => activeId = null)),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text((t['display_name'] as String?)?.isNotEmpty == true ? t['display_name'] as String : 'Scholar', maxLines: 1, overflow: TextOverflow.ellipsis, style: body(14, weight: FontWeight.w600)),
                Text('${t['email'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: body(12, color: AppColors.text3)),
              ]),
            ),
            if (t['device_block_started_at'] != null)
              GestureDetector(
                onTap: unlocking ? null : () => _unlock(t['user_id'] as String),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(color: AppColors.rose50, borderRadius: BorderRadius.circular(12)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.lock_open, size: 13, color: Color(0xFFE11D48)),
                    const SizedBox(width: 6),
                    Text(unlocking ? 'Unlocking…' : 'Device-locked — Unlock', style: body(12, weight: FontWeight.w600, color: const Color(0xFFE11D48))),
                  ]),
                ),
              ),
          ]),
        ),
        Expanded(
          child: ListView.builder(
            controller: scroll,
            padding: const EdgeInsets.all(16),
            itemCount: messages.length,
            itemBuilder: (_, i) {
              final m = messages[i];
              final mine = m['sender_role'] == 'admin';
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Align(
                  alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(color: mine ? AppColors.royal : AppColors.canvasSoft, borderRadius: BorderRadius.circular(16)),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${m['body']}', style: body(14, color: mine ? Colors.white : AppColors.text1)),
                      const SizedBox(height: 4),
                      Text(timeAgo(DateTime.parse(m['created_at'] as String)), style: body(10, color: mine ? Colors.white70 : AppColors.text3)),
                    ]),
                  ),
                ),
              );
            },
          ),
        ),
        Container(
          decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: AppColors.border))),
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            Expanded(child: TextField(controller: draft, onChanged: (_) => setState(() {}), onSubmitted: (_) => _send(), decoration: const InputDecoration(hintText: 'Reply as Support…'))),
            const SizedBox(width: 8),
            SizedBox(
              width: 40,
              height: 40,
              child: FilledButton(onPressed: sending || draft.text.trim().isEmpty ? null : _send, style: FilledButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(40, 40)), child: const Icon(Icons.send, size: 16)),
            ),
          ]),
        ),
      ]);
}
