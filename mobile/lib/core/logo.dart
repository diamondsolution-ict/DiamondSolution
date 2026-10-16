import 'package:flutter/material.dart';
import 'theme.dart';

/// The company logo (assets/logo.png, transparent background). `white` tints it white for use on
/// the navy gradient, like the website's `variant="white"`.
class LogoMark extends StatelessWidget {
  const LogoMark({super.key, this.height = 64, this.white = false});
  final double height;
  final bool white;
  @override
  Widget build(BuildContext context) {
    final img = Image.asset('assets/logo.png', height: height, filterQuality: FilterQuality.high);
    return white ? ColorFiltered(colorFilter: const ColorFilter.mode(Colors.white, BlendMode.srcIn), child: img) : img;
  }
}

/// Website `<DiamondLogo>`: mark + "Diamond Solution" wordmark (+ optional tagline).
class DiamondLogo extends StatelessWidget {
  const DiamondLogo({super.key, this.size = 56, this.showTagline = false, this.white = false, this.horizontal = false});
  final double size;
  final bool showTagline;
  final bool white;
  final bool horizontal;

  @override
  Widget build(BuildContext context) {
    final color = white ? Colors.white : AppColors.navy;
    final name = Text('Diamond Solution',
        style: heading((size * 0.4).clamp(18, 40), weight: FontWeight.w800, color: color, height: 1));
    final tagline = Text('Committed to raising first-class professionals.',
        textAlign: TextAlign.center, style: body(12, weight: FontWeight.w500, color: white ? AppColors.slate300 : const Color(0xFF475569)));
    final mark = LogoMark(height: size * 1.15, white: white);
    if (horizontal) {
      return Row(mainAxisSize: MainAxisSize.min, children: [mark, const SizedBox(width: 12), name]);
    }
    return Column(mainAxisSize: MainAxisSize.min, children: [
      mark,
      const SizedBox(height: 12),
      name,
      if (showTagline) ...[const SizedBox(height: 4), tagline],
    ]);
  }
}
