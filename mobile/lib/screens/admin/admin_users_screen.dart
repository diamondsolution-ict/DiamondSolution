import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show PostgrestException;
import '../../core/csv.dart';
import '../../core/supabase.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../main.dart';
import 'admin_common.dart';
import 'admin_gate.dart';

// Mirrors src/pages/admin/AdminUsers.tsx. Destructive actions go through admin-manage-user with a
// step-up token; creating a user does not (same as the web).
class AdminUsersScreen extends StatefulWidget {
  const AdminUsersScreen({super.key});
  @override
  State<AdminUsersScreen> createState() => _AdminUsersScreenState();
}

class _AdminUsersScreenState extends State<AdminUsersScreen> {
  List<Map<String, dynamic>> users = [];
  Map<String, String> emails = {}, roles = {}, affiliate = {};
  String search = '';
  String statusFilter = 'all';
  bool loading = true;
  String? busyId, error, info;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final rows = List<Map<String, dynamic>>.from(await db.from('profiles').select('user_id, display_name, username, university, whatsapp, phone, status, suspension_reason, currency, created_at, device_block_started_at').order('created_at', ascending: false));
      final ids = rows.map((u) => u['user_id'] as String).toList();
      if (ids.isNotEmpty) {
        // user_roles / affiliate_profiles hold few rows, so they're read whole; emails come in chunks.
        final r = await Future.wait<dynamic>([
          emailsFor(ids),
          db.from('user_roles').select('user_id, role'),
          db.from('affiliate_profiles').select('user_id, status'),
        ]);
        emails = r[0] as Map<String, String>;
        roles = {for (final e in r[1] as List) if (e['user_id'] is String) e['user_id'] as String: '${e['role']}'};
        affiliate = {for (final e in r[2] as List) if (e['user_id'] is String) e['user_id'] as String: '${e['status']}'};
      }
      if (mounted) {
        setState(() {
          users = rows;
          loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = "Couldn't load users: $e";
          loading = false;
        });
      }
    }
  }

  List<Map<String, dynamic>> get filtered {
    final q = search.trim().toLowerCase();
    return users.where((u) {
      if (statusFilter != 'all' && u['status'] != statusFilter) return false;
      if (q.isEmpty) return true;
      return [u['display_name'], u['username'], emails[u['user_id']], u['suspension_reason']].any((v) => '${v ?? ''}'.toLowerCase().contains(q));
    }).toList();
  }

  Future<void> _approvePartner(String id) async {
    setState(() {
      busyId = id;
      error = null;
    });
    try {
      await db.rpc('admin_activate_affiliate', params: {'p_user_id': id});
      info = 'Affiliate partner approved.';
      await _load();
    } catch (e) {
      error = '$e';
    }
    if (mounted) setState(() => busyId = null);
  }

  Future<void> _unlockDevice(String userId) async {
    setState(() {
      busyId = userId;
      error = null;
    });
    try {
      await db.rpc('admin_unlock_device', params: {'p_user_id': userId});
      info = 'Account unlocked.';
      await _load();
    } catch (e) {
      error = 'Unlock failed: ${e is PostgrestException ? e.message : e}';
    }
    if (mounted) setState(() => busyId = null);
  }

  Future<void> _run(String action, String userId, {String? reason, String? newRole, required String title}) async {
    final token = await askStepUp(context, title: title);
    if (token == null) return;
    setState(() {
      busyId = userId;
      error = null;
    });
    try {
      final r = await db.functions.invoke('admin-manage-user', body: {'action': action, 'target_user_id': userId, 'otp_token': token, if (reason != null) 'reason': reason, if (newRole != null) 'new_role': newRole});
      if ((r.data as Map?)?['success'] != true) throw Exception('unknown error');
      info = 'Done.';
      await _load();
    } catch (e) {
      error = 'Action failed: ${functionErrorMessage(e, 'unknown error')}';
    }
    if (mounted) setState(() => busyId = null);
  }

  Future<void> _deleteUser(String id, String name) async {
    final ok = await confirmDanger(context, title: 'Delete $name?', message: 'This permanently deletes the account and everything attached to it. It cannot be undone. If you only want to block them, suspend the account instead.');
    if (ok && mounted) _run('delete', id, title: 'Permanently delete this account.');
  }

  Future<void> _addUser() async {
    final email = TextEditingController(), pass = TextEditingController(), name = TextEditingController();
    String role = 'student';
    String? err;
    bool busy = false;
    final created = await showDialog<bool>(
      context: context,
      barrierColor: AppColors.navy.withValues(alpha: 0.5),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => Dialog(
          backgroundColor: Colors.transparent,
          insetPadding: const EdgeInsets.all(16),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 384),
            child: CardLuxury(
              padding: const EdgeInsets.all(24),
              child: SingleChildScrollView(
                child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text('Add user', style: heading(18)),
                  const SizedBox(height: 16),
                  TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(hintText: 'Email')),
                  const SizedBox(height: 12),
                  TextField(controller: pass, obscureText: true, decoration: const InputDecoration(hintText: 'Password (8+ characters)')),
                  const SizedBox(height: 12),
                  TextField(controller: name, decoration: const InputDecoration(hintText: 'Full name')),
                  const SizedBox(height: 12),
                  _roleDropdown(role, (v) => setS(() => role = v)),
                  if (err != null) ...[const SizedBox(height: 12), Banner2(err!)],
                  const SizedBox(height: 16),
                  Row(children: [
                    Expanded(child: BtnOutline(label: 'Cancel', onPressed: () => Navigator.pop(ctx))),
                    const SizedBox(width: 8),
                    Expanded(
                      child: BtnPrimary(
                        label: busy ? 'Creating…' : 'Create',
                        onPressed: busy
                            ? null
                            : () async {
                                if (email.text.isEmpty || pass.text.length < 8) {
                                  setS(() => err = 'Email and an 8+ character password are required.');
                                  return;
                                }
                                setS(() {
                                  busy = true;
                                  err = null;
                                });
                                try {
                                  final r = await db.functions.invoke('admin-manage-user', body: {'action': 'create', 'email': email.text, 'password': pass.text, if (name.text.isNotEmpty) 'display_name': name.text, 'role': role});
                                  if ((r.data as Map?)?['success'] != true) throw Exception('unknown error');
                                  if (ctx.mounted) Navigator.pop(ctx, true);
                                } catch (e) {
                                  setS(() {
                                    err = "Couldn't create user: ${functionErrorMessage(e, 'unknown error')}";
                                    busy = false;
                                  });
                                }
                              },
                      ),
                    ),
                  ]),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
    if (created == true) {
      setState(() => info = 'User created.');
      _load();
    }
  }

  Widget _roleDropdown(String value, ValueChanged<String> onChanged, {bool enabled = true, bool compact = false}) => Container(
        padding: EdgeInsets.symmetric(horizontal: compact ? 8 : 12),
        decoration: BoxDecoration(color: Colors.white, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<String>(
            value: value,
            isExpanded: !compact,
            isDense: compact,
            onChanged: enabled ? (v) => onChanged(v!) : null,
            style: body(compact ? 12 : 14),
            items: const [DropdownMenuItem(value: 'student', child: Text('Student')), DropdownMenuItem(value: 'moderator', child: Text('Moderator')), DropdownMenuItem(value: 'admin', child: Text('Admin'))],
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final me = AuthScope.of(context).user?.id;
    final f = filtered;
    return ListView(padding: const EdgeInsets.all(20), children: [
      AdminHeading('Users', subtitle: '${f.length} of ${users.length} users'),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: OutlinedButton(onPressed: f.isEmpty ? null : () => shareCsv('scholars_directory_export_${DateTime.now().millisecondsSinceEpoch}.csv', [['WhatsApp Number', 'Full Name', 'Username', 'University', 'Email', 'Role', 'Status'], for (final u in f) ['${u['whatsapp'] ?? u['phone'] ?? ''}', '${u['display_name'] ?? ''}', '${u['username'] ?? ''}', '${u['university'] ?? ''}', emails[u['user_id']] ?? '', roles[u['user_id']] ?? 'student', '${u['status']}']]), child: Text('Export CSV', style: body(14, weight: FontWeight.w600, color: AppColors.text2)))),
        const SizedBox(width: 8),
        Expanded(child: BtnPrimary(label: 'Add user', onPressed: _addUser)),
      ]),
      const SizedBox(height: 16),
      TextField(onChanged: (v) => setState(() => search = v), decoration: const InputDecoration(hintText: 'Search name, username, email, reason…')),
      const SizedBox(height: 8),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(color: Colors.white, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<String>(
            value: statusFilter,
            isExpanded: true,
            style: body(14),
            onChanged: (v) => setState(() => statusFilter = v!),
            items: const [DropdownMenuItem(value: 'all', child: Text('All')), DropdownMenuItem(value: 'active', child: Text('Active')), DropdownMenuItem(value: 'suspended', child: Text('Suspended'))],
          ),
        ),
      ),
      if (error != null) ...[const SizedBox(height: 12), Banner2(error!)],
      if (info != null) ...[const SizedBox(height: 12), Banner2(info!, success: true)],
      const SizedBox(height: 16),
      if (loading)
        Text('Loading…', style: body(14, color: AppColors.text3))
      else if (f.isEmpty)
        Text('No users match.', style: body(14, color: AppColors.text3))
      else
        for (final u in f) _card(u, me),
      const SizedBox(height: 80),
    ]);
  }

  Widget _card(Map<String, dynamic> u, String? me) {
    final id = u['user_id'] as String;
    final isSelf = id == me;
    final busy = busyId == id;
    final suspended = u['status'] == 'suspended';
    final role = roles[id] ?? 'student';
    final partner = affiliate[id] == 'active';
    Widget small(String label, Color fg, Color bg, Color border, VoidCallback? onTap) => GestureDetector(
          onTap: onTap,
          child: Opacity(
            opacity: onTap == null ? 0.5 : 1,
            child: Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6), decoration: BoxDecoration(color: bg, border: Border.all(color: border), borderRadius: BorderRadius.circular(12)), child: Text(label, style: body(12, weight: FontWeight.w600, color: fg))),
          ),
        );
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: CardLuxury(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text((u['display_name'] as String?)?.isNotEmpty == true ? u['display_name'] as String : 'Unnamed', style: heading(14)),
                if ((u['username'] as String?)?.isNotEmpty == true) Text('@${u['username']}', style: body(12, color: AppColors.royal).copyWith(fontFamily: 'monospace')),
                Text(emails[id] ?? '—', style: body(12, color: AppColors.text3)),
                Text(((u['whatsapp'] ?? u['phone']) as String?)?.isNotEmpty == true ? (u['whatsapp'] ?? u['phone']) as String : 'no contact', style: body(12, color: AppColors.text3)),
                const SizedBox(height: 4),
                Text(((u['university'] as String?)?.isNotEmpty == true ? u['university'] as String : 'No university set').toUpperCase(), style: body(12, weight: FontWeight.w600, color: AppColors.text2)),
              ]),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: suspended ? AppColors.rose50 : AppColors.emerald50, borderRadius: BorderRadius.circular(99)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Container(width: 6, height: 6, decoration: BoxDecoration(color: suspended ? AppColors.rose500 : const Color(0xFF10B981), shape: BoxShape.circle)),
                  const SizedBox(width: 6),
                  Text(suspended ? 'Suspended' : 'Active', style: body(12, weight: FontWeight.w700, color: suspended ? AppColors.rose700 : AppColors.emerald700)),
                ]),
              ),
              if (suspended) Padding(padding: const EdgeInsets.only(top: 4), child: SizedBox(width: 130, child: Text((u['suspension_reason'] as String?)?.isNotEmpty == true ? u['suspension_reason'] as String : 'No reason given', textAlign: TextAlign.right, style: body(11, color: AppColors.rose700)))),
            ]),
          ]),
          const SizedBox(height: 12),
          const Divider(height: 1, color: AppColors.border),
          const SizedBox(height: 12),
          Row(children: [
            Text('ROLE', style: body(10, weight: FontWeight.w700, color: AppColors.text3, letterSpacing: 0.5)),
            const SizedBox(width: 8),
            _roleDropdown(role, (v) {
              if (v != role) _run('change_role', id, newRole: v, title: 'Change role to $v.');
            }, enabled: !isSelf && !busy, compact: true),
            const Spacer(),
            if (partner) const Badge2('Partner') else small('Approve Partner', AppColors.royal, AppColors.royalSoft, AppColors.royalBorder, busy ? null : () => _approvePartner(id)),
          ]),
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 8, children: [
            if (suspended)
              small('Unsuspend', AppColors.royal, AppColors.royalSoft, AppColors.royalBorder, isSelf || busy ? null : () => _run('unsuspend', id, title: 'Restore this account.'))
            else
              small('Suspend', const Color(0xFFB45309), const Color(0xFFFFFBEB), const Color(0xFFFDE68A), isSelf || busy
                  ? null
                  : () async {
                      final reason = await promptDialog(context, 'Reason for suspension?', initial: 'Suspended by administrator.');
                      if (reason == null || !mounted) return;
                      _run('suspend', id, reason: reason, title: 'Suspend this account.');
                    }),
            if (u['device_block_started_at'] != null)
              small('Unlock device', AppColors.royal, AppColors.royalSoft, AppColors.royalBorder, busy ? null : () => _unlockDevice(id)),
            small('Delete', AppColors.rose700, AppColors.rose50, AppColors.rose200, isSelf || busy ? null : () => _deleteUser(id, '${u['display_name'] ?? 'this user'}')),
          ]),
        ]),
      ),
    );
  }
}
