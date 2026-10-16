import 'package:flutter/material.dart';
import 'theme.dart';

/// Website `.diamond-mesh`: canvas colour with a faint royal glow top-left and navy glow bottom-right.
class DiamondMesh extends StatelessWidget {
  const DiamondMesh({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Stack(children: [
        const Positioned.fill(child: ColoredBox(color: AppColors.canvas)),
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: Alignment.topLeft,
                radius: 1.1,
                colors: [AppColors.royal.withValues(alpha: 0.06), Colors.transparent],
                stops: const [0, 0.5],
              ),
            ),
          ),
        ),
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: Alignment.bottomRight,
                radius: 1.1,
                colors: [AppColors.navy.withValues(alpha: 0.05), Colors.transparent],
                stops: const [0, 0.5],
              ),
            ),
          ),
        ),
        child,
      ]);
}

/// Website `.card-luxury`: white, rounded-3xl, 1px canvas-border, soft shadow. `gradient: true`
/// gives the `.diamond-gradient` variant used for hero cards.
class CardLuxury extends StatelessWidget {
  const CardLuxury({super.key, required this.child, this.padding = const EdgeInsets.all(20), this.gradient = false, this.onTap, this.margin});
  final Widget child;
  final EdgeInsetsGeometry padding;
  final bool gradient;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(24);
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        gradient: gradient ? diamondGradient : null,
        color: gradient ? null : Colors.white,
        borderRadius: radius,
        border: Border.all(color: AppColors.border),
        boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.03), blurRadius: 20, offset: const Offset(0, 4))],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: radius,
        clipBehavior: Clip.antiAlias,
        child: InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
      ),
    );
  }
}

/// `.btn-primary`
class BtnPrimary extends StatelessWidget {
  const BtnPrimary({super.key, required this.label, this.icon, this.onPressed, this.big = false});
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final bool big;
  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          boxShadow: onPressed == null ? null : [BoxShadow(color: AppColors.royal.withValues(alpha: 0.2), blurRadius: 6, offset: const Offset(0, 4))],
        ),
        child: FilledButton(
          onPressed: onPressed,
          style: FilledButton.styleFrom(minimumSize: Size.fromHeight(big ? 52 : 46)),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, mainAxisSize: MainAxisSize.min, children: [
            if (icon != null) ...[Icon(icon, size: 16), const SizedBox(width: 8)],
            Flexible(
              child: Text(label,
                  overflow: TextOverflow.ellipsis,
                  style: big ? body(12, weight: FontWeight.w900, color: Colors.white, letterSpacing: 2.4) : body(14, weight: FontWeight.w600, color: Colors.white)),
            ),
          ]),
        ),
      );
}

/// `.btn-outline`
class BtnOutline extends StatelessWidget {
  const BtnOutline({super.key, required this.label, this.onPressed, this.big = false});
  final String label;
  final VoidCallback? onPressed;
  final bool big;
  @override
  Widget build(BuildContext context) => OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(minimumSize: Size.fromHeight(big ? 52 : 46)),
        child: Text(label, style: big ? body(12, weight: FontWeight.w900, color: AppColors.text2, letterSpacing: 2.4) : body(14, weight: FontWeight.w600, color: AppColors.text2)),
      );
}

/// `.badge-royal` / `.badge-gold`
class Badge2 extends StatelessWidget {
  const Badge2(this.label, {super.key, this.gold = false});
  final String label;
  final bool gold;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: gold ? AppColors.goldPale : AppColors.royalSoft,
          border: Border.all(color: gold ? AppColors.goldBorder : AppColors.royalBorder),
          borderRadius: BorderRadius.circular(99),
        ),
        child: Text(label, style: body(12, weight: FontWeight.w700, color: gold ? AppColors.goldDark : AppColors.royal)),
      );
}

/// Rounded error / info banners like the website's login and register forms.
class Banner2 extends StatelessWidget {
  const Banner2(this.message, {super.key, this.success = false});
  final String message;
  final bool success;
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: success ? AppColors.emerald50 : AppColors.rose50,
          border: Border.all(color: success ? const Color(0xFFA7F3D0) : AppColors.rose200),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(message, style: body(14, color: success ? AppColors.emerald700 : AppColors.rose700)),
      );
}
