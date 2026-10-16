import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/supabase.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import 'admin_common.dart';
import 'admin_courses_screen.dart';
import 'image_upload.dart';

// Mirrors src/pages/admin/AdminDepartments.tsx: list, create, edit (price history rows, status,
// picture), levels, delete. Prices are a history table: a changed amount/duration inserts a new row.
String _durationLabel(int? days) => days == null ? 'Lifetime' : (days == 365 ? '1 year' : '$days days');

class AdminDepartmentsScreen extends StatefulWidget {
  const AdminDepartmentsScreen({super.key});
  @override
  State<AdminDepartmentsScreen> createState() => _AdminDepartmentsScreenState();
}

class _AdminDepartmentsScreenState extends State<AdminDepartmentsScreen> {
  List<Map<String, dynamic>> depts = [], prices = [], levels = [];
  bool loading = true;
  String? listError;
  String? coursesFor; // department id whose courses are open

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final r = await Future.wait<dynamic>([
      db.from('departments').select('id, name, slug, status, image_path').order('name', ascending: true),
      db.from('department_pricing').select('department_id, currency, amount, access_duration_days, effective_from').lte('effective_from', DateTime.now().toUtc().toIso8601String()).order('effective_from', ascending: false),
      db.from('department_levels').select('id, department_id, label, sort_order').order('sort_order', ascending: true),
    ]);
    if (!mounted) return;
    setState(() {
      depts = List<Map<String, dynamic>>.from(r[0] as List);
      prices = List<Map<String, dynamic>>.from(r[1] as List);
      levels = List<Map<String, dynamic>>.from(r[2] as List);
      loading = false;
    });
  }

  num _price(String id, String cur) {
    for (final p in prices) {
      if (p['department_id'] == id && p['currency'] == cur) return asNum(p['amount']);
    }
    return 0;
  }

  int? _duration(String id) {
    for (final p in prices) {
      if (p['department_id'] == id && p['currency'] == 'NGN') return (p['access_duration_days'] as num?)?.toInt();
    }
    return null;
  }

  Future<void> _upsertPrice(String id, String cur, String raw, String durRaw) async {
    final amount = raw.trim().isEmpty ? 0 : num.tryParse(raw);
    if (amount == null) return;
    final dur = durRaw.trim().isEmpty ? null : int.tryParse(durRaw);
    if (amount == _price(id, cur) && dur == _duration(id)) return;
    await db.from('department_pricing').insert({'department_id': id, 'currency': cur, 'amount': amount, 'access_duration_days': dur});
  }

  Future<void> _create() async {
    final name = TextEditingController(), ngn = TextEditingController(text: '10000'), usd = TextEditingController(), dur = TextEditingController(text: '365'), lv = TextEditingController(text: '100L, 200L, 300L, 400L');
    String? err;
    bool saving = false;
    final ok = await showFormModal<bool>(
      context,
      title: 'Manifest new department',
      child: StatefulBuilder(
        builder: (ctx, setS) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          labeled('Name', TextField(controller: name, decoration: const InputDecoration(hintText: 'Nursing'))),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: labeled('Price (₦)', TextField(controller: ngn, keyboardType: TextInputType.number))),
            const SizedBox(width: 12),
            Expanded(child: labeled('Price (\$)', TextField(controller: usd, keyboardType: TextInputType.number), optional: 'optional')),
          ]),
          labeled('Access duration (days)', TextField(controller: dur, keyboardType: TextInputType.number, decoration: const InputDecoration(hintText: '365')), hint: '365 = 1 year from purchase. Leave blank for lifetime access.'),
          labeled('Levels (comma-separated)', TextField(controller: lv)),
          if (err != null) ...[Banner2(err!), const SizedBox(height: 12)],
          Row(children: [
            Expanded(child: BtnOutline(label: 'Cancel', onPressed: () => Navigator.pop(ctx))),
            const SizedBox(width: 8),
            Expanded(
              child: BtnPrimary(
                label: saving ? 'Saving…' : 'Create',
                onPressed: saving
                    ? null
                    : () async {
                        if (name.text.trim().isEmpty) {
                          setS(() => err = 'Name is required.');
                          return;
                        }
                        setS(() {
                          saving = true;
                          err = null;
                        });
                        try {
                          final d = await db.from('departments').insert({'name': name.text.trim(), 'slug': slugify(name.text)}).select('id').single();
                          final id = d['id'] as String;
                          final duration = dur.text.trim().isEmpty ? null : int.tryParse(dur.text);
                          if ((num.tryParse(ngn.text) ?? 0) > 0) await db.from('department_pricing').insert({'department_id': id, 'currency': 'NGN', 'amount': num.parse(ngn.text), 'access_duration_days': duration});
                          if ((num.tryParse(usd.text) ?? 0) > 0) await db.from('department_pricing').insert({'department_id': id, 'currency': 'USD', 'amount': num.parse(usd.text), 'access_duration_days': duration});
                          final labels = lv.text.split(',').map((l) => l.trim()).where((l) => l.isNotEmpty).toList();
                          if (labels.isNotEmpty) await db.from('department_levels').insert([for (var i = 0; i < labels.length; i++) {'department_id': id, 'label': labels[i], 'sort_order': i}]);
                          if (ctx.mounted) Navigator.pop(ctx, true);
                        } on PostgrestException catch (e) {
                          setS(() {
                            err = e.message;
                            saving = false;
                          });
                        }
                      },
              ),
            ),
          ]),
        ]),
      ),
    );
    if (ok == true) _load();
  }

  Future<void> _edit(Map<String, dynamic> d) async {
    final id = d['id'] as String;
    final name = TextEditingController(text: d['name'] as String);
    final ngn = TextEditingController(text: _price(id, 'NGN') > 0 ? '${_price(id, 'NGN')}' : '');
    final usd = TextEditingController(text: _price(id, 'USD') > 0 ? '${_price(id, 'USD')}' : '');
    final dur = TextEditingController(text: _duration(id)?.toString() ?? '');
    String status = d['status'] as String;
    String? imagePath = d['image_path'] as String?;
    String? err;
    bool saving = false;
    final ok = await showFormModal<bool>(
      context,
      title: 'Edit department',
      child: StatefulBuilder(
        builder: (ctx, setS) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          labeled(
            'Picture',
            ImageUpload(
              currentPath: imagePath,
              folder: 'departments',
              entityId: id,
              onUploaded: (p) async {
                setS(() => imagePath = p);
                await db.from('departments').update({'image_path': p}).eq('id', id);
              },
              onRemoved: () async {
                setS(() => imagePath = null);
                await db.from('departments').update({'image_path': null}).eq('id', id);
              },
            ),
          ),
          labeled('Name', TextField(controller: name)),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: labeled('Price (₦)', TextField(controller: ngn, keyboardType: TextInputType.number))),
            const SizedBox(width: 12),
            Expanded(child: labeled('Price (\$)', TextField(controller: usd, keyboardType: TextInputType.number), optional: 'optional')),
          ]),
          labeled('Access duration (days)', TextField(controller: dur, keyboardType: TextInputType.number, decoration: const InputDecoration(hintText: '365')), hint: '365 = 1 year from purchase. Leave blank for lifetime access. Changing this only affects future purchases — students who already paid keep the terms they bought under.'),
          labeled(
            'Status',
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(color: Colors.white, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
              child: DropdownButtonHideUnderline(child: DropdownButton<String>(value: status, isExpanded: true, style: body(14), onChanged: (v) => setS(() => status = v!), items: const [DropdownMenuItem(value: 'active', child: Text('Active')), DropdownMenuItem(value: 'archived', child: Text('Archived'))])),
            ),
          ),
          if (err != null) ...[Banner2(err!), const SizedBox(height: 12)],
          Row(children: [
            Expanded(child: BtnOutline(label: 'Cancel', onPressed: () => Navigator.pop(ctx))),
            const SizedBox(width: 8),
            Expanded(
              child: BtnPrimary(
                label: saving ? 'Saving…' : 'Save',
                onPressed: saving
                    ? null
                    : () async {
                        setS(() {
                          saving = true;
                          err = null;
                        });
                        try {
                          await db.from('departments').update({'name': name.text.trim(), 'slug': slugify(name.text), 'status': status}).eq('id', id);
                          await Future.wait([_upsertPrice(id, 'NGN', ngn.text, dur.text), _upsertPrice(id, 'USD', usd.text, dur.text)]);
                          if (ctx.mounted) Navigator.pop(ctx, true);
                        } on PostgrestException catch (e) {
                          setS(() {
                            err = e.message;
                            saving = false;
                          });
                        }
                      },
              ),
            ),
          ]),
        ]),
      ),
    );
    _load();
    if (ok != true) return;
  }

  Future<void> _levels(Map<String, dynamic> d) async {
    final id = d['id'] as String;
    final newLabel = TextEditingController();
    String? err;
    String? editingId;
    final editCtl = TextEditingController();
    await showFormModal<void>(
      context,
      title: 'Levels — ${d['name']}',
      child: StatefulBuilder(
        builder: (ctx, setS) {
          final list = levels.where((l) => l['department_id'] == id).toList()..sort((a, b) => asNum(a['sort_order']).compareTo(asNum(b['sort_order'])));
          Future<void> reload() async {
            await _load();
            if (ctx.mounted) setS(() {});
          }

          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (list.isEmpty) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text('No levels yet.', style: body(14, color: AppColors.text3))),
            for (final l in list)
              Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
                child: editingId == l['id']
                    ? Row(children: [
                        Expanded(child: TextField(controller: editCtl, autofocus: true)),
                        IconButton(
                          icon: const Icon(Icons.check, size: 18, color: AppColors.emerald600),
                          onPressed: () async {
                            if (editCtl.text.trim().isEmpty) return;
                            try {
                              await db.from('department_levels').update({'label': editCtl.text.trim()}).eq('id', l['id'] as String);
                              editingId = null;
                              await reload();
                            } on PostgrestException catch (e) {
                              setS(() => err = e.message);
                            }
                          },
                        ),
                      ])
                    : Row(children: [
                        Expanded(child: Text('${l['label']}', style: body(14, weight: FontWeight.w600))),
                        IconButton(
                          icon: const Icon(Icons.edit_outlined, size: 16, color: AppColors.text3),
                          onPressed: () => setS(() {
                            editingId = l['id'] as String;
                            editCtl.text = l['label'] as String;
                          }),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete_outline, size: 16, color: AppColors.text3),
                          onPressed: () async {
                            if (!await confirmDialog(ctx, 'Delete level "${l['label']}"? Courses using this level block deletion — remove or move them first.')) return;
                            try {
                              await db.from('department_levels').delete().eq('id', l['id'] as String);
                              await reload();
                            } on PostgrestException catch (e) {
                              setS(() => err = e.code == '23503' ? 'Can\'t delete "${l['label']}" — one or more courses still use this level. Move or delete those courses first.' : e.message);
                            }
                          },
                        ),
                      ]),
              ),
            Row(children: [
              Expanded(child: TextField(controller: newLabel, decoration: const InputDecoration(hintText: 'e.g. 600L'))),
              const SizedBox(width: 8),
              SizedBox(
                width: 44,
                height: 44,
                child: FilledButton(
                  style: FilledButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(44, 44)),
                  onPressed: () async {
                    final label = newLabel.text.trim();
                    if (label.isEmpty) return;
                    final next = list.fold<int>(-1, (m, l) => asNum(l['sort_order']).toInt() > m ? asNum(l['sort_order']).toInt() : m) + 1;
                    try {
                      await db.from('department_levels').insert({'department_id': id, 'label': label, 'sort_order': next});
                      newLabel.clear();
                      err = null;
                      await reload();
                    } on PostgrestException catch (e) {
                      setS(() => err = e.message);
                    }
                  },
                  child: const Icon(Icons.add, size: 18),
                ),
              ),
            ]),
            if (err != null) ...[const SizedBox(height: 12), Banner2(err!)],
          ]);
        },
      ),
    );
  }

  Future<void> _delete(Map<String, dynamic> d) async {
    if (!await confirmDialog(context, 'Delete "${d['name']}"? This can\'t be undone. Departments with existing courses, pricing history, or students can\'t be deleted — archive them instead.')) return;
    setState(() => listError = null);
    try {
      await db.from('departments').delete().eq('id', d['id'] as String);
      await _load();
    } on PostgrestException catch (e) {
      setState(() => listError = e.code == '23503' ? 'Can\'t delete "${d['name']}" — it still has courses, pricing history, or students attached. Archive it instead (Edit Details → Status).' : e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (coursesFor != null) {
      return PopScope(
        canPop: false,
        onPopInvokedWithResult: (_, __) => setState(() => coursesFor = null),
        child: AdminCoursesScreen(departmentId: coursesFor!, onBack: () => setState(() => coursesFor = null)),
      );
    }
    return ListView(padding: const EdgeInsets.all(20), children: [
      const AdminHeading('Departments & Faculties', subtitle: 'Manage department tuition fees, custom levels, and pictures.'),
      const SizedBox(height: 12),
      BtnPrimary(icon: Icons.add, label: 'Manifest new department', onPressed: _create),
      if (listError != null) ...[const SizedBox(height: 16), Banner2(listError!)],
      const SizedBox(height: 24),
      if (loading)
        Text('Loading…', style: body(14, color: AppColors.text3))
      else if (depts.isEmpty)
        const EmptyCard(icon: Icons.grid_view, message: 'No departments yet — manifest one above.')
      else
        for (final d in depts) _card(d),
      const SizedBox(height: 80),
    ]);
  }

  Widget _card(Map<String, dynamic> d) {
    final id = d['id'] as String;
    final path = d['image_path'] as String?;
    final url = path == null ? null : db.storage.from('media').getPublicUrl(path);
    final ngn = _price(id, 'NGN');
    final usd = _price(id, 'USD');
    final active = d['status'] == 'active';
    Widget link(String t, Color c, VoidCallback f) => GestureDetector(onTap: f, child: Text(t.toUpperCase(), style: body(12, weight: FontWeight.w700, color: c, letterSpacing: 0.3)));
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: CardLuxury(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            if (url != null)
              ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.network(url, width: 44, height: 44, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox(width: 44, height: 44)))
            else
              Container(width: 44, height: 44, decoration: BoxDecoration(gradient: diamondGradient, borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.school_outlined, size: 18, color: Colors.white)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${d['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: body(14, weight: FontWeight.w700)),
                Text('${d['slug']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: body(12, color: AppColors.text3, style: FontStyle.italic).copyWith(fontFamily: 'monospace')),
              ]),
            ),
            Row(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 6, height: 6, decoration: BoxDecoration(color: active ? const Color(0xFF10B981) : AppColors.text3, shape: BoxShape.circle)),
              const SizedBox(width: 6),
              Text(active ? 'ACTIVE' : 'ARCHIVED', style: body(12, weight: FontWeight.w700, color: active ? AppColors.emerald600 : AppColors.text3, letterSpacing: 0.4)),
            ]),
          ]),
          const SizedBox(height: 12),
          const Divider(height: 1, color: AppColors.border),
          const SizedBox(height: 12),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.start, children: [
            ngn > 0
                ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('₦${groupDigits(ngn)}', style: body(14, weight: FontWeight.w700)),
                    if (usd > 0) Text('\$${groupDigits(usd)}', style: body(12, weight: FontWeight.w600, color: AppColors.text3)),
                    Text('${_durationLabel(_duration(id))} access', style: body(12, color: AppColors.text3)),
                  ])
                : Text('No price set', style: body(12, color: AppColors.text3)),
            Text(url != null ? '✓ Picture uploaded' : 'No picture', style: body(12, color: url != null ? AppColors.emerald600 : AppColors.text3)),
          ]),
          const SizedBox(height: 12),
          const Divider(height: 1, color: AppColors.border),
          const SizedBox(height: 12),
          Wrap(spacing: 16, runSpacing: 8, children: [
            link('Edit archives', AppColors.royal, () => setState(() => coursesFor = id)),
            link('Edit details', AppColors.emerald600, () => _edit(d)),
            link('Levels', AppColors.text2, () => _levels(d)),
            link('Delete', const Color(0xFFE11D48), () => _delete(d)),
          ]),
        ]),
      ),
    );
  }
}
