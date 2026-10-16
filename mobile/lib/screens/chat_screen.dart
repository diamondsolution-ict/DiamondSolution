import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/supabase.dart';
import '../core/theme.dart';
import '../core/time_ago.dart';
import '../core/ui.dart';

// Mirrors src/pages/Chat.tsx ("Chat with Support").
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, this.embedded = false});
  /// True when shown as a tab inside HomeShell (which already has the header).
  final bool embedded;
  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final draft = TextEditingController();
  final scroll = ScrollController();
  List<Map<String, dynamic>> messages = [];
  String? threadId;
  RealtimeChannel? channel;
  bool loading = true;
  bool loadError = false;
  String? loadErrorMessage;
  bool sending = false;
  String? error;

  @override
  void initState() {
    super.initState();
    _init();
  }

  @override
  void dispose() {
    if (channel != null) db.removeChannel(channel!);
    super.dispose();
  }

  Future<void> _init({bool isRetry = false}) async {
    setState(() {
      loading = true;
      loadError = false;
    });
    try {
      // Scoped to this user explicitly: staff accounts can see every thread through RLS.
      final thread = await db.from('chat_threads').select('id').eq('user_id', db.auth.currentUser!.id).maybeSingle();
      if (thread != null) {
        threadId = thread['id'] as String;
        await _loadMessages();
        _subscribe();
      }
      if (mounted) setState(() => loading = false);
    } catch (e) {
      // One retry: a request fired right as the screen mounts can race a just-expired token refresh.
      if (!isRetry) {
        await Future<void>.delayed(const Duration(milliseconds: 800));
        if (mounted) await _init(isRetry: true);
        return;
      }
      if (mounted) {
        setState(() {
          loadError = true;
          loadErrorMessage = e is PostgrestException ? e.message : 'Something went wrong — check your connection and try again.';
          loading = false;
        });
      }
    }
  }

  Future<void> _loadMessages() async {
    final rows = await db.from('chat_messages').select('id, sender_role, body, created_at').eq('thread_id', threadId!).order('created_at', ascending: true);
    messages = List<Map<String, dynamic>>.from(rows);
    await db.rpc('mark_chat_thread_read_by_user');
    _scrollToEnd();
  }

  void _subscribe() {
    if (channel != null) return;
    channel = db
        .channel('chat-thread-$threadId')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'chat_messages',
          filter: PostgresChangeFilter(type: PostgresChangeFilterType.eq, column: 'thread_id', value: threadId!),
          callback: (payload) {
            final row = payload.newRecord;
            if (messages.any((m) => m['id'] == row['id'])) return;
            setState(() => messages = [...messages, row]);
            if (row['sender_role'] == 'admin') db.rpc('mark_chat_thread_read_by_user');
            _scrollToEnd();
          },
        )
        .subscribe();
  }

  void _scrollToEnd() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (scroll.hasClients) scroll.jumpTo(scroll.position.maxScrollExtent);
      });

  Future<void> _send() async {
    final text = draft.text.trim();
    if (text.isEmpty || sending) return;
    setState(() {
      sending = true;
      error = null;
    });
    draft.clear();
    try {
      final newThread = await db.rpc('send_chat_message', params: {'p_body': text});
      if (threadId == null && newThread != null) {
        threadId = newThread as String;
        await _loadMessages();
        _subscribe();
      }
    } catch (e) {
      error = e is PostgrestException ? e.message : '$e';
      draft.text = text;
    }
    if (mounted) setState(() => sending = false);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.embedded) {
      // Card sits above the floating bottom bar, like the website's fixed-height chat card.
      return Padding(padding: const EdgeInsets.fromLTRB(16, 16, 16, 104), child: _card());
    }
    return PageShell(title: 'Chat with Support', child: Padding(padding: const EdgeInsets.all(16), child: _card()));
  }

  Widget _card() => CardLuxury(padding: EdgeInsets.zero, child: Column(children: [Expanded(child: _messagesArea()), if (error != null) _errorLine(), _composer()]));

  Widget _messagesArea() {
    if (loading) return const Center(child: CircularProgressIndicator());
    if (loadError) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text("Couldn't load your conversation", textAlign: TextAlign.center, style: heading(14)),
            const SizedBox(height: 8),
            Text(loadErrorMessage ?? 'Check your connection and try again.', textAlign: TextAlign.center, style: body(14, color: AppColors.text3)),
            const SizedBox(height: 12),
            SizedBox(width: 140, child: BtnOutline(label: 'Retry', onPressed: () => _init())),
          ]),
        ),
      );
    }
    if (messages.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('Say hello 👋', style: heading(14)),
            const SizedBox(height: 6),
            Text('Questions about payments, courses, or your account? Send a message and our team will reply here.', textAlign: TextAlign.center, style: body(14, color: AppColors.text3)),
          ]),
        ),
      );
    }
    return ListView.builder(
      controller: scroll,
      padding: const EdgeInsets.all(16),
      itemCount: messages.length,
      itemBuilder: (context, i) {
        final m = messages[i];
        final mine = m['sender_role'] == 'student';
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Align(
            alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8 - 32),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(color: mine ? AppColors.royal : AppColors.canvasSoft, borderRadius: BorderRadius.circular(16)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  if (m['sender_role'] == 'admin') Padding(padding: const EdgeInsets.only(bottom: 2), child: Text('SUPPORT', style: body(10, weight: FontWeight.w700, color: AppColors.royal, letterSpacing: 0.5))),
                  Text(m['body'] as String, style: body(14, color: mine ? Colors.white : AppColors.text1)),
                  const SizedBox(height: 4),
                  Text(timeAgo(DateTime.parse(m['created_at'] as String).toLocal()), style: body(10, color: mine ? Colors.white.withValues(alpha: 0.7) : AppColors.text3)),
                ]),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _errorLine() => Container(
        width: double.infinity,
        decoration: const BoxDecoration(border: Border(top: BorderSide(color: AppColors.border))),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Text(error!, style: body(12, color: const Color(0xFFDC2626))),
      );

  Widget _composer() => Container(
        decoration: const BoxDecoration(border: Border(top: BorderSide(color: AppColors.border))),
        padding: const EdgeInsets.all(12),
        child: Row(children: [
          Expanded(
            child: TextField(
              controller: draft,
              onChanged: (_) => setState(() {}),
              onSubmitted: (_) => _send(),
              style: body(14),
              decoration: const InputDecoration(hintText: 'Type a message…'),
            ),
          ),
          const SizedBox(width: 8),
          Opacity(
            opacity: sending || draft.text.trim().isEmpty ? 0.5 : 1,
            child: Material(
              color: AppColors.royal,
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: sending || draft.text.trim().isEmpty ? null : _send,
                child: const SizedBox(width: 40, height: 40, child: Icon(Icons.send, size: 16, color: Colors.white)),
              ),
            ),
          ),
        ]),
      );
}
