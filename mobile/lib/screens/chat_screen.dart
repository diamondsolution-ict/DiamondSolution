import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/supabase.dart';
import '../core/theme.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});
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

  Future<void> _init() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      // Scoped to this user explicitly: staff accounts can see every thread through RLS.
      final thread = await db.from('chat_threads').select('id').eq('user_id', db.auth.currentUser!.id).maybeSingle();
      if (thread != null) {
        threadId = thread['id'] as String;
        await _loadMessages();
        _subscribe();
      }
    } catch (e) {
      error = '$e';
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> _loadMessages() async {
    final rows = await db
        .from('chat_messages')
        .select('id, sender_role, body, created_at')
        .eq('thread_id', threadId!)
        .order('created_at', ascending: true);
    messages = List<Map<String, dynamic>>.from(rows);
    await db.rpc('mark_chat_thread_read_by_user');
    _scrollToEnd();
  }

  void _subscribe() {
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
    final body = draft.text.trim();
    if (body.isEmpty || sending) return;
    setState(() {
      sending = true;
      error = null;
    });
    draft.clear();
    try {
      final newThread = await db.rpc('send_chat_message', params: {'p_body': body});
      if (threadId == null && newThread != null) {
        threadId = newThread as String;
        await _loadMessages();
        _subscribe();
      }
    } catch (e) {
      error = '$e';
      draft.text = body;
    }
    if (mounted) setState(() => sending = false);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Chat with support')),
        body: Column(children: [
          Expanded(
            child: loading
                ? const Center(child: CircularProgressIndicator())
                : messages.isEmpty
                    ? const Center(
                        child: Padding(
                          padding: EdgeInsets.all(24),
                          child: Text('Questions about payments, courses or your account? Send a message and our team will reply here.',
                              textAlign: TextAlign.center),
                        ),
                      )
                    : ListView.builder(
                        controller: scroll,
                        padding: const EdgeInsets.all(16),
                        itemCount: messages.length,
                        itemBuilder: (context, i) {
                          final m = messages[i];
                          final mine = m['sender_role'] != 'admin';
                          return Align(
                            alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 8),
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
                              decoration: BoxDecoration(
                                color: mine ? AppColors.royal : AppColors.canvasSoft,
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: Text(m['body'] as String, style: TextStyle(color: mine ? Colors.white : AppColors.navy)),
                            ),
                          );
                        },
                      ),
          ),
          if (error != null) Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Text(error!, style: const TextStyle(color: AppColors.danger))),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Row(children: [
                Expanded(child: TextField(controller: draft, minLines: 1, maxLines: 4, decoration: const InputDecoration(hintText: 'Type a message'))),
                IconButton(onPressed: sending ? null : _send, icon: const Icon(Icons.send, color: AppColors.royal)),
              ]),
            ),
          ),
        ]),
      );
}
