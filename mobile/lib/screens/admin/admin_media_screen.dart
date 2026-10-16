import 'package:flutter/material.dart';
import '../../core/supabase.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import 'image_upload.dart';

// Mirrors src/pages/admin/AdminMedia.tsx.
class AdminMediaScreen extends StatefulWidget {
  const AdminMediaScreen({super.key});
  @override
  State<AdminMediaScreen> createState() => _AdminMediaScreenState();
}

class _AdminMediaScreenState extends State<AdminMediaScreen> {
  bool courses = false;
  List<Map<String, dynamic>> departments = [], courseRows = [];
  String search = '';
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final r = await Future.wait<dynamic>([
      db.from('departments').select('id, name, image_path').order('name', ascending: true),
      db.from('courses').select('id, title, image_path, department_id, department_levels ( label )').isFilter('deleted_at', null).order('title', ascending: true),
    ]);
    if (!mounted) return;
    setState(() {
      departments = List<Map<String, dynamic>>.from(r[0] as List);
      courseRows = List<Map<String, dynamic>>.from(r[1] as List);
      loading = false;
    });
  }

  Future<void> _setImage(String table, String id, String? path) async {
    setState(() {
      final list = table == 'departments' ? departments : courseRows;
      for (var i = 0; i < list.length; i++) {
        if (list[i]['id'] == id) list[i] = {...list[i], 'image_path': path};
      }
    });
    await db.from(table).update({'image_path': path}).eq('id', id);
  }

  @override
  Widget build(BuildContext context) {
    final q = search.trim().toLowerCase();
    final list = courses ? courseRows.where((c) => q.isEmpty || '${c['title']}'.toLowerCase().contains(q)).toList() : departments.where((d) => q.isEmpty || '${d['name']}'.toLowerCase().contains(q)).toList();
    return ListView(padding: const EdgeInsets.all(20), children: [
      const HeroCard(badge: 'Media & Visual Assets Hub', title: 'Department & Course Picture Manager', subtitle: 'Upload pictures displayed on each Department and Course card across the student dashboard.'),
      const SizedBox(height: 16),
      Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(color: Colors.white, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          for (final t in [(false, 'Departments (${departments.length})'), (true, 'Courses (${courseRows.length})')])
            Expanded(
              child: GestureDetector(
                onTap: () => setState(() {
                  courses = t.$1;
                  search = '';
                }),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: courses == t.$1 ? AppColors.royal : Colors.transparent, borderRadius: BorderRadius.circular(8)),
                  child: Text(t.$2, style: body(14, weight: FontWeight.w600, color: courses == t.$1 ? Colors.white : AppColors.text3)),
                ),
              ),
            ),
        ]),
      ),
      const SizedBox(height: 16),
      TextField(key: ValueKey(courses), onChanged: (v) => setState(() => search = v), decoration: InputDecoration(prefixIcon: const Icon(Icons.search, size: 16), hintText: 'Search ${courses ? 'courses' : 'departments'}…')),
      const SizedBox(height: 16),
      if (loading)
        Text('Loading…', style: body(14, color: AppColors.text3))
      else if (list.isEmpty)
        EmptyCard(icon: Icons.folder_open, message: 'No ${courses ? 'courses' : 'departments'} match.')
      else
        for (final row in list)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: CardLuxury(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${courses ? row['title'] : row['name']}', style: heading(14)),
                if (courses) Text('${(row['department_levels'] as Map?)?['label'] ?? ''}', style: body(12, color: AppColors.text3)),
                const SizedBox(height: 8),
                ImageUpload(
                  key: ValueKey(row['id']),
                  currentPath: row['image_path'] as String?,
                  folder: courses ? 'courses' : 'departments',
                  entityId: row['id'] as String,
                  onUploaded: (p) => _setImage(courses ? 'courses' : 'departments', row['id'] as String, p),
                  onRemoved: () => _setImage(courses ? 'courses' : 'departments', row['id'] as String, null),
                ),
              ]),
            ),
          ),
      const SizedBox(height: 80),
    ]);
  }
}
