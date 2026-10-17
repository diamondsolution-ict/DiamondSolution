import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/supabase.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import 'admin_common.dart';

// Mirrors src/pages/admin/AdminCourses.tsx for one department ("Edit archives" on the Departments page).
const _placeholderMarker = '[PLACEHOLDER — auto-generated, safe to delete once real questions are added]';

class AdminCoursesScreen extends StatefulWidget {
  const AdminCoursesScreen({super.key, required this.departmentId, required this.onBack, this.onManageQuestions});
  final String departmentId;
  final VoidCallback onBack;
  final void Function(Map<String, dynamic> course)? onManageQuestions;
  @override
  State<AdminCoursesScreen> createState() => _AdminCoursesScreenState();
}

class _AdminCoursesScreenState extends State<AdminCoursesScreen> {
  String deptName = '';
  List<Map<String, dynamic>> levels = [], courses = [];
  Map<String, String> content = {};
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final id = widget.departmentId;
    final r = await Future.wait<dynamic>([
      db.from('departments').select('name').eq('id', id).maybeSingle(),
      db.from('department_levels').select('id, department_id, label').eq('department_id', id).order('sort_order', ascending: true),
      db.from('courses').select('id, title, slug, status, department_id, level_id, default_question_type, description').eq('department_id', id).isFilter('deleted_at', null).order('title', ascending: true),
    ]);
    final cs = List<Map<String, dynamic>>.from(r[2] as List);
    final state = <String, String>{};
    if (cs.isNotEmpty) {
      final q = await db.from('questions').select('course_id, explanation').inFilter('course_id', cs.map((c) => c['id'] as String).toList()).eq('status', 'active').isFilter('deleted_at', null);
      final by = <String, List<String>>{};
      for (final x in q) {
        (by[x['course_id'] as String] ??= []).add((x['explanation'] as String?) ?? '');
      }
      for (final c in cs) {
        final l = by[c['id']];
        state[c['id'] as String] = l == null || l.isEmpty ? 'none' : (l.every((e) => e == _placeholderMarker) ? 'placeholder' : 'real');
      }
    }
    if (!mounted) return;
    setState(() {
      deptName = ((r[0] as Map?)?['name'] as String?) ?? '';
      levels = List<Map<String, dynamic>>.from(r[1] as List);
      courses = cs;
      content = state;
      loading = false;
    });
  }

  String _level(String? id) => levels.firstWhere((l) => l['id'] == id, orElse: () => {'label': '—'})['label'] as String;

  Future<void> _form([Map<String, dynamic>? c]) async {
    final title = TextEditingController(text: c?['title'] as String? ?? '');
    final desc = TextEditingController(text: c?['description'] as String? ?? '');
    String levelId = c?['level_id'] as String? ?? '';
    String type = c?['default_question_type'] as String? ?? 'objective';
    String status = c?['status'] as String? ?? 'published';
    String? err;
    bool saving = false;
    Widget dropdown<T>(T value, List<DropdownMenuItem<T>> items, ValueChanged<T?> on) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(color: Colors.white, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
          child: DropdownButtonHideUnderline(child: DropdownButton<T>(value: value, isExpanded: true, style: body(14), onChanged: on, items: items)),
        );
    final ok = await showFormModal<bool>(
      context,
      title: c == null ? 'Add course' : 'Edit course',
      child: StatefulBuilder(
        builder: (ctx, setS) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (err != null) ...[Banner2(err!), const SizedBox(height: 12)],
          labeled('Title', TextField(controller: title, autofocus: true)),
          labeled('Level', dropdown<String>(levelId, [const DropdownMenuItem(value: '', child: Text('Select a level')), for (final l in levels) DropdownMenuItem(value: l['id'] as String, child: Text('${l['label']}'))], (v) => setS(() => levelId = v ?? ''))),
          labeled('Question type', dropdown<String>(type, const [DropdownMenuItem(value: 'objective', child: Text('Objective (multiple choice)')), DropdownMenuItem(value: 'application', child: Text('Application'))], (v) => setS(() => type = v!))),
          labeled('Description (optional)', TextField(controller: desc, minLines: 3, maxLines: 3)),
          if (c != null) labeled('Status', dropdown<String>(status, const [DropdownMenuItem(value: 'draft', child: Text('Draft')), DropdownMenuItem(value: 'published', child: Text('Published')), DropdownMenuItem(value: 'archived', child: Text('Archived'))], (v) => setS(() => status = v!))),
          BtnPrimary(
            label: saving ? (c == null ? 'Creating…' : 'Saving…') : (c == null ? 'Create course' : 'Save changes'),
            onPressed: saving
                ? null
                : () async {
                    if (title.text.trim().isEmpty || levelId.isEmpty) {
                      setS(() => err = 'Pick a department and level first.');
                      return;
                    }
                    setS(() {
                      saving = true;
                      err = null;
                    });
                    try {
                      final row = {'level_id': levelId, 'title': title.text.trim(), 'slug': slugify(title.text), 'description': desc.text.isEmpty ? null : desc.text, 'default_question_type': type};
                      if (c == null) {
                        await db.from('courses').insert({...row, 'department_id': widget.departmentId, 'status': 'published'});
                      } else {
                        await db.from('courses').update({...row, 'status': status}).eq('id', c['id'] as String);
                      }
                      if (ctx.mounted) Navigator.pop(ctx, true);
                    } on PostgrestException catch (e) {
                      setS(() {
                        err = e.message;
                        saving = false;
                      });
                    }
                  },
          ),
        ]),
      ),
    );
    if (ok == true) _load();
  }

  Widget _badge(String? state) {
    if (state == 'real') return const SizedBox.shrink();
    final placeholder = state == 'placeholder';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: placeholder ? const Color(0xFFFFFBEB) : AppColors.rose50, borderRadius: BorderRadius.circular(99)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.warning_amber_rounded, size: 12, color: placeholder ? const Color(0xFFB45309) : AppColors.rose700),
        const SizedBox(width: 4),
        Text(placeholder ? 'Placeholder only' : 'No questions', style: body(11, weight: FontWeight.w600, color: placeholder ? const Color(0xFFB45309) : AppColors.rose700)),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(20), children: [
        GestureDetector(
          onTap: widget.onBack,
          child: Row(children: [const Icon(Icons.arrow_back, size: 16, color: AppColors.royal), const SizedBox(width: 6), Text('Departments', style: body(14, weight: FontWeight.w600, color: AppColors.royal))]),
        ),
        const SizedBox(height: 12),
        AdminHeading('Courses', subtitle: deptName),
        const SizedBox(height: 16),
        BtnPrimary(icon: Icons.add, label: 'Add course', onPressed: () => _form()),
        const SizedBox(height: 24),
        if (loading)
          Text('Loading…', style: body(14, color: AppColors.text3))
        else if (courses.isEmpty)
          const EmptyCard(icon: Icons.menu_book_outlined, message: 'No courses yet — add one above.')
        else
          for (final c in courses)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: CardLuxury(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Container(width: 40, height: 40, decoration: const BoxDecoration(color: AppColors.royalSoft, shape: BoxShape.circle), child: const Icon(Icons.menu_book_outlined, size: 17, color: AppColors.royal)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${c['title']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: heading(16)),
                        Text('${_level(c['level_id'] as String?)} · ${c['default_question_type']} · ${c['status']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: body(14, color: AppColors.text3)),
                      ]),
                    ),
                    _badge(content[c['id']]),
                  ]),
                  const SizedBox(height: 12),
                  const Divider(height: 1, color: AppColors.border),
                  const SizedBox(height: 12),
                  Wrap(spacing: 16, runSpacing: 8, children: [
                    GestureDetector(onTap: () => _form(c), child: Row(mainAxisSize: MainAxisSize.min, children: [const Icon(Icons.edit_outlined, size: 13, color: AppColors.royal), const SizedBox(width: 4), Text('Edit', style: body(14, weight: FontWeight.w600, color: AppColors.royal))])),
                    if (widget.onManageQuestions != null)
                      GestureDetector(onTap: () => widget.onManageQuestions!(c), child: Row(mainAxisSize: MainAxisSize.min, children: [const Icon(Icons.checklist, size: 13, color: AppColors.royal), const SizedBox(width: 4), Text('Manage questions →', style: body(14, weight: FontWeight.w600, color: AppColors.royal))])),
                  ]),
                ]),
              ),
            ),
        const SizedBox(height: 80),
      ]);
}
