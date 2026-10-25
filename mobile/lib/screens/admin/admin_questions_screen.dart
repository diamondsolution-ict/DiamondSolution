import 'package:flutter/material.dart';
import '../../core/friendly_error.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/csv.dart';
import '../../core/supabase.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import 'admin_common.dart';
import 'image_upload.dart';

// Mirrors src/pages/admin/AdminQuestionsBrowser.tsx and AdminQuestions.tsx. CSV import/export
// uses the phone's file picker and share sheet.
const _optionLabels = ['A', 'B', 'C', 'D', 'E'];
const _placeholderMarker = '[PLACEHOLDER — auto-generated, safe to delete once real questions are added]';

/// "Questions" section: pick a department / course, then open its editor.
class AdminQuestionsBrowserScreen extends StatefulWidget {
  const AdminQuestionsBrowserScreen({super.key});
  @override
  State<AdminQuestionsBrowserScreen> createState() => _BrowserState();
}

class _BrowserState extends State<AdminQuestionsBrowserScreen> {
  List<Map<String, dynamic>> departments = [], courses = [];
  String departmentId = '';
  String search = '';
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final r = await Future.wait<dynamic>([
      db.from('departments').select('id, name').order('name', ascending: true),
      db.from('courses').select('id, title, department_id, department_levels ( label )').isFilter('deleted_at', null).order('title', ascending: true),
    ]);
    if (!mounted) return;
    setState(() {
      departments = List<Map<String, dynamic>>.from(r[0] as List);
      courses = List<Map<String, dynamic>>.from(r[1] as List);
      loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final q = search.trim().toLowerCase();
    final f = courses.where((c) => (departmentId.isEmpty || c['department_id'] == departmentId) && (q.isEmpty || '${c['title']}'.toLowerCase().contains(q))).toList();
    return ListView(padding: const EdgeInsets.all(20), children: [
      Row(children: [const Icon(Icons.help_outline, size: 22, color: AppColors.royal), const SizedBox(width: 8), Text('Questions', style: heading(24))]),
      const SizedBox(height: 4),
      Text('Browse by department, then pick a course to manage its questions.', style: body(14, color: AppColors.text3)),
      const SizedBox(height: 16),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(color: Colors.white, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<String>(
            value: departmentId,
            isExpanded: true,
            style: body(14),
            onChanged: (v) => setState(() => departmentId = v ?? ''),
            items: [const DropdownMenuItem(value: '', child: Text('All departments')), for (final d in departments) DropdownMenuItem(value: d['id'] as String, child: Text('${d['name']}'))],
          ),
        ),
      ),
      const SizedBox(height: 8),
      TextField(onChanged: (v) => setState(() => search = v), decoration: const InputDecoration(prefixIcon: Icon(Icons.search, size: 16), hintText: 'Search series/courses…')),
      const SizedBox(height: 16),
      if (loading)
        Text('Loading…', style: body(14, color: AppColors.text3))
      else if (f.isEmpty)
        const EmptyCard(icon: Icons.menu_book_outlined, message: 'No courses match.')
      else
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final c in f)
            GestureDetector(
              onTap: () => openCourseQuestions(context, c['id'] as String),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(color: Colors.white, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.menu_book_outlined, size: 13, color: AppColors.text2),
                  const SizedBox(width: 6),
                  Flexible(child: Text('${c['title']}', style: body(12, weight: FontWeight.w600, color: AppColors.text2))),
                  if ((((c['department_levels'] as Map?)?['label']) as String?)?.isNotEmpty == true) Text(' (${(c['department_levels'] as Map)['label']})', style: body(12, weight: FontWeight.w600, color: AppColors.text3)),
                ]),
              ),
            ),
        ]),
      const SizedBox(height: 80),
    ]);
  }
}

void openCourseQuestions(BuildContext context, String courseId) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AdminCourseQuestionsScreen(courseId: courseId)));

class AdminCourseQuestionsScreen extends StatefulWidget {
  const AdminCourseQuestionsScreen({super.key, required this.courseId});
  final String courseId;
  @override
  State<AdminCourseQuestionsScreen> createState() => _CourseQuestionsState();
}

class _CourseQuestionsState extends State<AdminCourseQuestionsScreen> {
  Map<String, dynamic>? course;
  List<Map<String, dynamic>> departments = [], levels = [], questions = [], outline = [];
  bool loading = true;
  String? loadError;
  bool archivedTab = false;
  String search = '';
  bool bulkBusy = false;

  List<Map<String, dynamic>> get active => questions.where((q) => q['status'] == 'active').toList();
  List<Map<String, dynamic>> get archived => questions.where((q) => q['status'] == 'trashed').toList();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      loadError = null;
    });
    try {
      final r = await Future.wait<dynamic>([
        db.from('courses').select('id, title, slug, department_id, level_id, default_question_type, description, image_path').eq('id', widget.courseId).maybeSingle(),
        db.from('departments').select('id, name').order('name', ascending: true),
        db.from('department_levels').select('id, department_id, label').order('sort_order', ascending: true),
      ]);
      // Keyset paging by id: a plain select caps at 1000 rows, which a big course can exceed.
      final rows = <Map<String, dynamic>>[];
      String? last;
      for (;;) {
        var q = db.from('questions').select('id, type, prompt, expected_answer, explanation, sort_order, status, question_options(id, label, body, is_correct, sort_order)').eq('course_id', widget.courseId).inFilter('status', ['active', 'trashed']);
        if (last != null) q = q.gt('id', last);
        final page = List<Map<String, dynamic>>.from(await q.order('id', ascending: true).limit(1000));
        rows.addAll(page);
        if (page.length < 1000) break;
        last = page.last['id'] as String;
      }
      rows.sort((a, b) => asNum(a['sort_order']).compareTo(asNum(b['sort_order'])));
      for (final q in rows) {
        final o = List<Map<String, dynamic>>.from(q['question_options'] as List)..sort((a, b) => asNum(a['sort_order']).compareTo(asNum(b['sort_order'])));
        q['options'] = o;
      }
      final out = await db.from('course_outline_sections').select('id, title, start_question_order, end_question_order, sort_order').eq('course_id', widget.courseId).order('sort_order', ascending: true);
      if (!mounted) return;
      setState(() {
        course = r[0] as Map<String, dynamic>?;
        departments = List<Map<String, dynamic>>.from(r[1] as List);
        levels = List<Map<String, dynamic>>.from(r[2] as List);
        questions = rows;
        outline = List<Map<String, dynamic>>.from(out);
        loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          loadError = friendlyError(e);
          loading = false;
        });
      }
    }
  }

  bool _matches(Map<String, dynamic> q, String needle) {
    if (needle.isEmpty) return true;
    final hay = [q['prompt'], q['expected_answer'] ?? '', q['explanation'] ?? '', for (final o in q['options'] as List) o['body']].join(' \n ').toLowerCase();
    return hay.contains(needle);
  }

  // ---- question form -------------------------------------------------------------------------
  Future<void> _questionForm([Map<String, dynamic>? q]) async {
    String type = q?['type'] as String? ?? (course?['default_question_type'] as String? ?? 'objective');
    final prompt = TextEditingController(text: q?['prompt'] as String? ?? '');
    final expl = TextEditingController(text: q?['explanation'] as String? ?? '');
    final expected = TextEditingController(text: q?['expected_answer'] as String? ?? '');
    final opts = [for (final l in _optionLabels) TextEditingController(text: q == null ? '' : ((q['options'] as List).firstWhere((o) => o['label'] == l, orElse: () => {'body': ''})['body'] as String))];
    int correct = q == null ? 0 : ((q['options'] as List).indexWhere((o) => o['is_correct'] == true)).clamp(0, 4);
    if (q == null) {
      // New objective questions start with four options like the website.
    }
    String? err;
    bool saving = false;
    final ok = await showFormModal<bool>(
      context,
      title: q == null ? 'Add question' : 'Edit question',
      child: StatefulBuilder(
        builder: (ctx, setS) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (err != null) ...[Banner2(err!), const SizedBox(height: 12)],
          labeled(
            'Type',
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(color: Colors.white, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
              child: DropdownButtonHideUnderline(child: DropdownButton<String>(value: type, isExpanded: true, style: body(14), onChanged: (v) => setS(() => type = v!), items: const [DropdownMenuItem(value: 'objective', child: Text('Objective (multiple choice)')), DropdownMenuItem(value: 'application', child: Text('Application'))])),
            ),
          ),
          labeled('Question', TextField(controller: prompt, minLines: 3, maxLines: 6)),
          if (type == 'objective') ...[
            Padding(padding: const EdgeInsets.only(bottom: 4), child: Text('Options (select the correct one)', style: body(14, weight: FontWeight.w500, color: AppColors.text2))),
            for (var i = 0; i < 4; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(children: [
                  GestureDetector(onTap: () => setS(() => correct = i), child: Icon(correct == i ? Icons.radio_button_checked : Icons.radio_button_unchecked, size: 20, color: AppColors.royal)),
                  const SizedBox(width: 8),
                  SizedBox(width: 18, child: Text(_optionLabels[i], style: body(14, weight: FontWeight.w600, color: AppColors.text3))),
                  Expanded(child: TextField(controller: opts[i])),
                ]),
              ),
            // Option E exists only when an imported/edited question already has one.
            if ((q?['options'] as List?)?.any((o) => o['label'] == 'E') == true)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(children: [
                  GestureDetector(onTap: () => setS(() => correct = 4), child: Icon(correct == 4 ? Icons.radio_button_checked : Icons.radio_button_unchecked, size: 20, color: AppColors.royal)),
                  const SizedBox(width: 8),
                  SizedBox(width: 18, child: Text('E', style: body(14, weight: FontWeight.w600, color: AppColors.text3))),
                  Expanded(child: TextField(controller: opts[4])),
                ]),
              ),
            const SizedBox(height: 4),
          ] else
            labeled('Expected answer', TextField(controller: expected, minLines: 2, maxLines: 5)),
          labeled('Explanation (optional)', TextField(controller: expl, minLines: 2, maxLines: 5)),
          BtnPrimary(
            label: saving ? (q == null ? 'Adding…' : 'Saving…') : (q == null ? 'Add question' : 'Save changes'),
            onPressed: saving
                ? null
                : () async {
                    final shown = (q?['options'] as List?)?.any((o) => o['label'] == 'E') == true ? 5 : 4;
                    if (type == 'objective' && [for (var i = 0; i < shown; i++) opts[i].text].where((o) => o.trim().isNotEmpty).length < 2) {
                      setS(() => err = 'Add at least two options.');
                      return;
                    }
                    if (type == 'application' && expected.text.trim().isEmpty) {
                      setS(() => err = 'Add the expected answer.');
                      return;
                    }
                    if (prompt.text.trim().isEmpty) {
                      setS(() => err = 'Add the question.');
                      return;
                    }
                    setS(() {
                      saving = true;
                      err = null;
                    });
                    try {
                      String id;
                      final fields = {'type': type, 'prompt': prompt.text, 'explanation': expl.text.isEmpty ? null : expl.text, 'expected_answer': type == 'application' ? expected.text : null};
                      if (q != null) {
                        id = q['id'] as String;
                        await db.from('questions').update(fields).eq('id', id);
                        await db.from('question_options').delete().eq('question_id', id);
                      } else {
                        final ins = await db.from('questions').insert({'course_id': widget.courseId, ...fields, 'sort_order': active.length}).select('id').single();
                        id = ins['id'] as String;
                      }
                      if (type == 'objective') {
                        final rows = [
                          for (var i = 0; i < shown; i++)
                            if (opts[i].text.trim().isNotEmpty) {'question_id': id, 'label': _optionLabels[i], 'body': opts[i].text, 'is_correct': i == correct, 'sort_order': i}
                        ];
                        await db.from('question_options').insert(rows);
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

  Future<void> _archive(String id) async {
    if (!await confirmDialog(context, "Archive this question? It's hidden from students immediately, and can be restored later from the Archived tab.")) return;
    await db.from('questions').update({'status': 'trashed', 'deleted_at': DateTime.now().toUtc().toIso8601String()}).eq('id', id);
    _load();
  }

  Future<void> _restore(String id) async {
    await db.from('questions').update({'status': 'active', 'deleted_at': null}).eq('id', id);
    _load();
  }

  Future<void> _hardDelete(String id) async {
    if (!await confirmDanger(context, title: 'Delete this question forever?', message: 'This cannot be undone. If you only want to hide it from students, use Archive instead.')) return;
    await db.from('questions').delete().eq('id', id);
    _load();
  }

  Future<void> _bulkArchive() async {
    if (active.isEmpty) return;
    if (!await confirmDanger(context, title: 'Archive all ${active.length} questions?', message: 'Every active question in "${course?['title']}" is hidden from students immediately. You can restore them one at a time from the Archived tab.', confirmLabel: 'Archive all')) return;
    setState(() => bulkBusy = true);
    await db.from('questions').update({'status': 'trashed', 'deleted_at': DateTime.now().toUtc().toIso8601String()}).eq('course_id', widget.courseId).eq('status', 'active');
    if (mounted) setState(() => bulkBusy = false);
    _load();
  }


  // ---- CSV -------------------------------------------------------------------------------------
  bool get _isApp => course?['default_question_type'] == 'application';
  List<String> get _csvHeaders => _isApp ? ['Question', 'Expected Answer'] : ['Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Option E', 'Correct Answer (A-E or 0-4)', 'Explanation'];

  void _template() => shareCsv(_isApp ? 'application_question_template.csv' : 'question_import_template.csv', [
        _csvHeaders,
        _isApp ? ['Describe the key concepts of the system architecture.', 'Key concepts: microservices decoupling, event-driven processing.'] : ['Sample question?', 'Option 1', 'Option 2', 'Option 3', 'Option 4', 'Option 5', 'A', 'Because it is A'],
      ]);

  void _export() {
    if (course == null || active.isEmpty) return;
    shareCsv('archive_${'${course!['title']}'.replaceAll(RegExp(r'\s+'), '_')}.csv', [
      _csvHeaders,
      for (final q in active)
        if (_isApp)
          ['${q['prompt']}', '${q['expected_answer'] ?? ''}']
        else ...[
          () {
            String by(String l) => ((q['options'] as List).firstWhere((o) => o['label'] == l, orElse: () => {'body': ''})['body'] as String);
            final correct = (q['options'] as List).firstWhere((o) => o['is_correct'] == true, orElse: () => {'label': 'A'})['label'] as String;
            return ['${q['prompt']}', by('A'), by('B'), by('C'), by('D'), by('E'), correct, '${q['explanation'] ?? ''}'];
          }()
        ],
    ]);
  }

  bool importing = false;

  // Same column mapping as the website (and the old app's export): objective = question, options A-E,
  // correct answer (letter or 0-4), explanation; application = question, expected answer.
  Future<void> _import() async {
    final text = await pickCsvText();
    if (text == null || course == null) return;
    final rows = parseCsv(text).skip(1).toList();
    setState(() => importing = true);
    var imported = 0;
    var next = active.length;
    for (final row in rows) {
      if (row.isEmpty) continue;
      if (!_isApp && row.length < 6) continue;
      String c(int i) => i < row.length ? row[i].trim() : '';
      final qText = c(0);
      if (qText.isEmpty) continue;
      try {
        final ins = await db.from('questions').insert({'course_id': widget.courseId, 'type': _isApp ? 'application' : 'objective', 'prompt': qText, 'expected_answer': _isApp ? (c(1).isNotEmpty ? c(1) : c(7)) : null, 'explanation': _isApp ? null : (c(7).isEmpty ? null : c(7)), 'sort_order': next++}).select('id').single();
        if (!_isApp) {
          final raw = c(6).toUpperCase();
          final idx = _optionLabels.contains(raw) ? _optionLabels.indexOf(raw) : (int.tryParse(raw) != null && int.parse(raw) >= 0 && int.parse(raw) <= 4 ? int.parse(raw) : 0);
          await db.from('question_options').insert([for (var i = 0; i < 5; i++) {'question_id': ins['id'], 'label': _optionLabels[i], 'body': c(i + 1).isEmpty ? 'Option ${_optionLabels[i]}' : c(i + 1), 'is_correct': i == idx, 'sort_order': i}]);
        }
        imported++;
      } on PostgrestException {
        continue;
      }
    }
    if (mounted) {
      setState(() => importing = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$imported question(s) imported.')));
    }
    _load();
  }

  // ---- course details -------------------------------------------------------------------------
  Future<void> _editDetails() async {
    final c = course!;
    final title = TextEditingController(text: c['title'] as String);
    final desc = TextEditingController(text: (c['description'] as String?) ?? '');
    String deptId = c['department_id'] as String;
    String levelId = c['level_id'] as String;
    String type = c['default_question_type'] as String;
    String? image = c['image_path'] as String?;
    String? err;
    bool saving = false;
    Widget dd<T>(T v, List<DropdownMenuItem<T>> items, ValueChanged<T?> on) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(color: Colors.white, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
          child: DropdownButtonHideUnderline(child: DropdownButton<T>(value: v, isExpanded: true, style: body(14), onChanged: on, items: items)),
        );
    final ok = await showFormModal<bool>(
      context,
      title: 'Edit course details',
      child: StatefulBuilder(
        builder: (ctx, setS) {
          final lvls = levels.where((l) => l['department_id'] == deptId).toList();
          if (!lvls.any((l) => l['id'] == levelId)) levelId = '';
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (err != null) ...[Banner2(err!), const SizedBox(height: 12)],
            labeled(
              'Picture',
              ImageUpload(
                currentPath: image,
                folder: 'courses',
                entityId: widget.courseId,
                onUploaded: (p) => setS(() => image = p),
                onRemoved: () => setS(() => image = null),
              ),
            ),
            labeled('Title', TextField(controller: title)),
            labeled('Department', dd<String>(deptId, [for (final d in departments) DropdownMenuItem(value: d['id'] as String, child: Text('${d['name']}'))], (v) => setS(() => deptId = v!))),
            labeled('Level', dd<String>(levelId, [const DropdownMenuItem(value: '', child: Text('Select a level')), for (final l in lvls) DropdownMenuItem(value: l['id'] as String, child: Text('${l['label']}'))], (v) => setS(() => levelId = v ?? ''))),
            labeled('Question type', dd<String>(type, const [DropdownMenuItem(value: 'objective', child: Text('Objective (multiple choice)')), DropdownMenuItem(value: 'application', child: Text('Application'))], (v) => setS(() => type = v!))),
            labeled('Description (optional)', TextField(controller: desc, minLines: 3, maxLines: 3)),
            BtnPrimary(
              label: saving ? 'Saving…' : 'Save changes',
              onPressed: saving
                  ? null
                  : () async {
                      if (title.text.trim().isEmpty || deptId.isEmpty || levelId.isEmpty) {
                        setS(() => err = 'Title, department, and level are all required.');
                        return;
                      }
                      setS(() {
                        saving = true;
                        err = null;
                      });
                      try {
                        await db.from('courses').update({'title': title.text.trim(), 'slug': slugify(title.text), 'department_id': deptId, 'level_id': levelId, 'default_question_type': type, 'description': desc.text.trim().isEmpty ? null : desc.text.trim(), 'image_path': image}).eq('id', widget.courseId);
                        if (ctx.mounted) Navigator.pop(ctx, true);
                      } on PostgrestException catch (e) {
                        setS(() {
                          err = e.message;
                          saving = false;
                        });
                      }
                    },
            ),
          ]);
        },
      ),
    );
    if (ok == true) _load();
  }

  // ---- outline --------------------------------------------------------------------------------
  Future<void> _outlineForm([Map<String, dynamic>? s]) async {
    final n = active.length;
    final lastEnd = outline.fold<int>(0, (m, x) => asNum(x['end_question_order']).toInt() > m ? asNum(x['end_question_order']).toInt() : m);
    final title = TextEditingController(text: s?['title'] as String? ?? '');
    final start = TextEditingController(text: '${s?['start_question_order'] ?? lastEnd + 1}');
    final end = TextEditingController(text: '${s?['end_question_order'] ?? n}');
    String? err;
    bool saving = false;
    final ok = await showFormModal<bool>(
      context,
      title: s == null ? 'New section' : 'Edit section',
      child: StatefulBuilder(
        builder: (ctx, setS) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (err != null) ...[Banner2(err!), const SizedBox(height: 12)],
          labeled('Title', TextField(controller: title, decoration: const InputDecoration(hintText: 'e.g. Orbit and Ear (Part 1)'))),
          Row(children: [
            Expanded(child: labeled('Start question #', TextField(controller: start, keyboardType: TextInputType.number))),
            const SizedBox(width: 12),
            Expanded(child: labeled('End question #', TextField(controller: end, keyboardType: TextInputType.number))),
          ]),
          BtnPrimary(
            label: saving ? 'Saving…' : (s == null ? 'Add section' : 'Save changes'),
            onPressed: saving
                ? null
                : () async {
                    final a = int.tryParse(start.text), b = int.tryParse(end.text);
                    if (title.text.trim().isEmpty) {
                      setS(() => err = 'Give this section a title.');
                      return;
                    }
                    if (a == null || b == null || a < 1) {
                      setS(() => err = 'Start/end must be whole numbers, starting from 1.');
                      return;
                    }
                    if (b < a) {
                      setS(() => err = 'End must be greater than or equal to start.');
                      return;
                    }
                    if (b > n) {
                      setS(() => err = "This course only has $n question(s) — end can't exceed that.");
                      return;
                    }
                    setS(() {
                      saving = true;
                      err = null;
                    });
                    try {
                      final row = {'title': title.text.trim(), 'start_question_order': a, 'end_question_order': b};
                      if (s == null) {
                        await db.from('course_outline_sections').insert({'course_id': widget.courseId, ...row, 'sort_order': outline.length});
                      } else {
                        await db.from('course_outline_sections').update(row).eq('id', s['id'] as String);
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

  // ---- UI -------------------------------------------------------------------------------------
  @override
  Widget build(BuildContext context) {
    final title = (course?['title'] as String?) ?? 'Questions';
    return PageShell(title: title, child: _body());
  }

  Widget _body() {
    if (loading) return const Center(child: CircularProgressIndicator());
    if (loadError != null) {
      return Padding(padding: const EdgeInsets.all(20), child: Column(children: [Text("Couldn't load this course", style: body(14, weight: FontWeight.w600)), const SizedBox(height: 8), Text(loadError!, style: body(14, color: AppColors.text3)), const SizedBox(height: 12), BtnPrimary(label: 'Retry', onPressed: _load)]));
    }
    if (course == null) return Padding(padding: const EdgeInsets.all(20), child: Text('Course not found.', style: body(14, color: AppColors.text3)));
    final c = course!;
    final deptName = departments.firstWhere((d) => d['id'] == c['department_id'], orElse: () => {'name': null})['name'] as String?;
    final levelLabel = levels.firstWhere((l) => l['id'] == c['level_id'], orElse: () => {'label': null})['label'] as String?;
    final imgPath = c['image_path'] as String?;
    final img = imgPath == null ? null : db.storage.from('media').getPublicUrl(imgPath);
    final needle = search.trim().toLowerCase();
    final visible = (archivedTab ? archived : active).where((q) => _matches(q, needle)).toList();
    return ListView(padding: const EdgeInsets.all(20), children: [
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (img != null)
          ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.network(img, width: 64, height: 64, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox(width: 64, height: 64)))
        else
          Container(width: 64, height: 64, decoration: BoxDecoration(color: AppColors.royalSoft, borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.help_outline, size: 24, color: AppColors.royal)),
        const SizedBox(width: 16),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${c['title']}', style: heading(20)),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [if (deptName != null) Badge2(deptName, gold: true), if (levelLabel != null) Badge2(levelLabel), Badge2('${c['default_question_type'] ?? 'objective'}'.replaceFirstMapped(RegExp(r'^.'), (m) => m[0]!.toUpperCase()))]),
          ]),
        ),
      ]),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: OutlinedButton.icon(onPressed: _editDetails, icon: const Icon(Icons.edit_outlined, size: 13), label: Text('Edit details', style: body(12, weight: FontWeight.w600, color: AppColors.text2)))),
        const SizedBox(width: 8),
        Expanded(
          child: GestureDetector(
            onTap: bulkBusy || active.isEmpty ? null : _bulkArchive,
            child: Opacity(
              opacity: bulkBusy || active.isEmpty ? 0.5 : 1,
              child: Container(
                height: 46,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: AppColors.rose50, border: Border.all(color: AppColors.rose200), borderRadius: BorderRadius.circular(12)),
                child: Text(bulkBusy ? 'Archiving…' : 'Bulk archive (${active.length})', style: body(12, weight: FontWeight.w600, color: AppColors.rose700)),
              ),
            ),
          ),
        ),
      ]),
      const SizedBox(height: 12),
      Wrap(spacing: 8, runSpacing: 8, children: [
        OutlinedButton.icon(onPressed: _template, style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)), icon: const Icon(Icons.download, size: 14), label: Text('Download template', style: body(14, weight: FontWeight.w600, color: AppColors.text2))),
        OutlinedButton.icon(onPressed: importing ? null : _import, style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)), icon: const Icon(Icons.upload, size: 14), label: Text(importing ? 'Importing…' : 'Import archive', style: body(14, weight: FontWeight.w600, color: AppColors.text2))),
        OutlinedButton.icon(onPressed: active.isEmpty ? null : _export, style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)), icon: const Icon(Icons.download, size: 14), label: Text('Export archive', style: body(14, weight: FontWeight.w600, color: AppColors.text2))),
      ]),
      const SizedBox(height: 16),
      BtnPrimary(icon: Icons.add, label: 'Add new question', onPressed: () => _questionForm()),
      const SizedBox(height: 16),
      TextField(onChanged: (v) => setState(() => search = v), decoration: const InputDecoration(prefixIcon: Icon(Icons.search, size: 16), hintText: 'Search queries, options, expected answer, or explanation…')),
      const SizedBox(height: 16),
      Row(children: [
        for (final t in [(false, 'Active (${active.length})'), (true, 'Archived (${archived.length})')])
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: GestureDetector(
              onTap: () => setState(() => archivedTab = t.$1),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                decoration: BoxDecoration(color: archivedTab == t.$1 ? AppColors.royal : AppColors.canvasSoft, borderRadius: BorderRadius.circular(99)),
                child: Text(t.$2.toUpperCase(), style: body(12, weight: FontWeight.w700, color: archivedTab == t.$1 ? Colors.white : AppColors.text3, letterSpacing: 0.4)),
              ),
            ),
          ),
      ]),
      const SizedBox(height: 16),
      if (visible.isEmpty)
        EmptyCard(icon: Icons.help_outline, message: needle.isNotEmpty ? 'No questions match your search.' : (archivedTab ? 'No archived questions.' : 'No questions yet — add one above.'))
      else
        for (var i = 0; i < visible.length; i++) _questionCard(i, visible[i]),
      const SizedBox(height: 24),
      _outlineCard(),
      const SizedBox(height: 80),
    ]);
  }

  Widget _iconBtn(IconData i, Color c, VoidCallback f) => GestureDetector(onTap: f, child: Padding(padding: const EdgeInsets.all(6), child: Icon(i, size: 15, color: c)));

  Widget _questionCard(int i, Map<String, dynamic> q) {
    final trashed = q['status'] == 'trashed';
    final placeholder = q['explanation'] == _placeholderMarker;
    final objective = q['type'] == 'objective';
    return Opacity(
      opacity: trashed ? 0.7 : 1,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: CardLuxury(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(width: 24, height: 24, alignment: Alignment.center, decoration: BoxDecoration(color: AppColors.royalSoft, border: Border.all(color: AppColors.royalBorder), shape: BoxShape.circle), child: Text('${i + 1}', style: body(12, weight: FontWeight.w700, color: AppColors.royal))),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${q['prompt']}', style: body(14, weight: FontWeight.w500)),
                  if (placeholder)
                    Container(
                      margin: const EdgeInsets.only(top: 4),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(color: const Color(0xFFFFFBEB), border: Border.all(color: const Color(0xFFFDE68A)), borderRadius: BorderRadius.circular(99)),
                      child: Text('PLACEHOLDER — NOT REAL CONTENT', style: body(10, weight: FontWeight.w700, color: const Color(0xFFB45309), letterSpacing: 0.3)),
                    ),
                ]),
              ),
              if (!trashed) ...[_iconBtn(Icons.edit_outlined, AppColors.royal, () => _questionForm(q)), _iconBtn(Icons.delete_outline, const Color(0xFFE11D48), () => _archive(q['id'] as String))] else ...[_iconBtn(Icons.unarchive_outlined, AppColors.emerald600, () => _restore(q['id'] as String)), _iconBtn(Icons.delete_outline, const Color(0xFFE11D48), () => _hardDelete(q['id'] as String))],
            ]),
            const SizedBox(height: 12),
            if (objective)
              for (final o in q['options'] as List)
                Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: o['is_correct'] == true ? AppColors.emerald50 : null, border: Border.all(color: o['is_correct'] == true ? const Color(0xFF6EE7B7) : AppColors.border), borderRadius: BorderRadius.circular(8)),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    if (o['is_correct'] == true) const Padding(padding: EdgeInsets.only(top: 2, right: 6), child: Icon(Icons.check_circle_outline, size: 13, color: AppColors.emerald600)),
                    Expanded(child: Text('${o['label']}. ${o['body']}', style: body(14, weight: o['is_correct'] == true ? FontWeight.w600 : FontWeight.w400, color: o['is_correct'] == true ? const Color(0xFF065F46) : AppColors.text2))),
                  ]),
                )
            else
              Container(width: double.infinity, padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: AppColors.canvasSoft, borderRadius: BorderRadius.circular(8)), child: Text('Expected: ${q['expected_answer'] ?? ''}', style: body(14, color: AppColors.text2))),
            if ((q['explanation'] as String?)?.isNotEmpty == true && !placeholder) ...[
              const SizedBox(height: 4),
              const Divider(height: 1, color: AppColors.border),
              const SizedBox(height: 12),
              Row(children: [const Icon(Icons.lightbulb_outline, size: 12, color: AppColors.navy), const SizedBox(width: 6), Text('EXPLANATION', style: body(11, weight: FontWeight.w700, color: AppColors.navy, letterSpacing: 0.4))]),
              const SizedBox(height: 4),
              Text('${q['explanation']}', style: body(14, color: AppColors.text3, style: FontStyle.italic)),
            ],
          ]),
        ),
      ),
    );
  }

  Widget _outlineCard() => CardLuxury(
        padding: const EdgeInsets.all(24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [const Icon(Icons.account_tree_outlined, size: 17, color: AppColors.royal), const SizedBox(width: 8), Text('Course outline', style: heading(16))]),
          const SizedBox(height: 4),
          Text('Breaks the ${active.length} question(s) above into named sections — shown to students as "Academic objectives" on the course page, and triggers the "section complete" checkpoint mid-quiz.', style: body(14, color: AppColors.text3)),
          const SizedBox(height: 12),
          OutlinedButton.icon(onPressed: active.isEmpty ? null : () => _outlineForm(), icon: const Icon(Icons.add, size: 14), label: Text('Add section', style: body(14, weight: FontWeight.w600, color: AppColors.text2))),
          if (active.isEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text('Add questions above first — sections reference question positions.', style: body(12, color: AppColors.text3))),
          const SizedBox(height: 12),
          for (final s in outline)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${s['title']}', style: body(14, weight: FontWeight.w600)),
                    Text('Questions ${s['start_question_order']}–${s['end_question_order']}', style: body(12, color: AppColors.text3)),
                  ]),
                ),
                _iconBtn(Icons.edit_outlined, AppColors.royal, () => _outlineForm(s)),
                _iconBtn(Icons.delete_outline, const Color(0xFFE11D48), () async {
                  await db.from('course_outline_sections').delete().eq('id', s['id'] as String);
                  _load();
                }),
              ]),
            ),
        ]),
      );
}
