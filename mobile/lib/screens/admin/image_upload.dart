import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/supabase.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';

// Mirrors src/components/ImageUpload.tsx: JPG/PNG/WebP up to 5MB into the public `media` bucket at
// `<folder>/<entityId>.<ext>` (upsert, so a re-upload replaces rather than piles up files).
const _maxBytes = 5 * 1024 * 1024;
const _types = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp'};

class ImageUpload extends StatefulWidget {
  const ImageUpload({super.key, required this.currentPath, required this.folder, required this.entityId, required this.onUploaded, required this.onRemoved});
  final String? currentPath;
  final String folder;
  final String entityId;
  final ValueChanged<String> onUploaded;
  final VoidCallback onRemoved;
  @override
  State<ImageUpload> createState() => _ImageUploadState();
}

class _ImageUploadState extends State<ImageUpload> {
  bool uploading = false;
  String? error;

  Future<void> _pick() async {
    setState(() => error = null);
    final file = await ImagePicker().pickImage(source: ImageSource.gallery);
    if (file == null) return;
    final ext = file.name.contains('.') ? file.name.split('.').last.toLowerCase() : '';
    if (!_types.containsKey(ext)) {
      setState(() => error = 'Only JPG, PNG, or WebP images are allowed.');
      return;
    }
    final bytes = await file.readAsBytes();
    if (bytes.length > _maxBytes) {
      setState(() => error = 'Image must be 5MB or smaller.');
      return;
    }
    setState(() => uploading = true);
    try {
      final path = '${widget.folder}/${widget.entityId}.$ext';
      await db.storage.from('media').uploadBinary(path, bytes, fileOptions: FileOptions(upsert: true, contentType: _types[ext]));
      widget.onUploaded(path);
    } on StorageException catch (e) {
      error = e.message;
    } catch (_) {
      error = 'Upload failed — check your connection and try again.';
    }
    if (mounted) setState(() => uploading = false);
  }

  @override
  Widget build(BuildContext context) {
    final path = widget.currentPath;
    final url = path == null ? null : db.storage.from('media').getPublicUrl(path);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (url != null)
        Stack(children: [
          ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.network(url, height: 128, width: double.infinity, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox(height: 128))),
          Positioned(
            right: 8,
            top: 8,
            child: GestureDetector(onTap: widget.onRemoved, child: Container(padding: const EdgeInsets.all(4), decoration: BoxDecoration(color: AppColors.navy.withValues(alpha: 0.7), shape: BoxShape.circle), child: const Icon(Icons.close, size: 14, color: Colors.white))),
          ),
        ])
      else
        Container(
          height: 128,
          decoration: BoxDecoration(color: AppColors.canvasSoft, border: Border.all(color: AppColors.border, width: 2), borderRadius: BorderRadius.circular(12)),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [const Icon(Icons.image_outlined, size: 22, color: AppColors.text3), const SizedBox(height: 4), Text('No picture set', style: body(12, color: AppColors.text3))]),
        ),
      const SizedBox(height: 8),
      OutlinedButton.icon(
        onPressed: uploading ? null : _pick,
        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(36)),
        icon: const Icon(Icons.upload, size: 13),
        label: Text(uploading ? 'Uploading…' : (url != null ? 'Change picture' : 'Upload picture'), style: body(12, weight: FontWeight.w600, color: AppColors.text2)),
      ),
      if (error != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(error!, style: body(12, color: const Color(0xFFE11D48)))),
    ]);
  }
}

/// Gradient hero card the web uses at the top of Media and Departments pages.
class HeroCard extends StatelessWidget {
  const HeroCard({super.key, required this.badge, required this.title, required this.subtitle});
  final String badge, title, subtitle;
  @override
  Widget build(BuildContext context) => CardLuxury(
        gradient: true,
        padding: const EdgeInsets.all(24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: AppColors.goldPale, border: Border.all(color: AppColors.goldBorder), borderRadius: BorderRadius.circular(99)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [const Icon(Icons.image_outlined, size: 13, color: AppColors.goldDark), const SizedBox(width: 6), Flexible(child: Text(badge, style: body(12, weight: FontWeight.w700, color: AppColors.goldDark)))]),
          ),
          const SizedBox(height: 8),
          Text(title, style: heading(20, color: Colors.white)),
          const SizedBox(height: 4),
          Text(subtitle, style: body(14, color: Colors.white.withValues(alpha: 0.8))),
        ]),
      );
}
