/// date-fns `formatDistanceToNow(date, { addSuffix: true })`, e.g. "5 minutes ago".
String timeAgo(DateTime then) {
  final diff = DateTime.now().difference(then);
  final future = diff.isNegative;
  final secs = diff.inSeconds.abs();
  final mins = (secs / 60).round();
  String s;
  if (secs < 30) {
    s = 'less than a minute';
  } else if (secs < 90) {
    s = '1 minute';
  } else if (mins < 45) {
    s = '$mins minutes';
  } else if (mins < 90) {
    s = 'about 1 hour';
  } else if (mins < 1440) {
    s = 'about ${(mins / 60).round()} hours';
  } else if (mins < 2520) {
    s = '1 day';
  } else if (mins < 43200) {
    s = '${(mins / 1440).round()} days';
  } else if (mins < 86400) {
    s = 'about ${(mins / 43200).round()} months';
  } else {
    final months = (mins / 43200).round();
    if (months < 12) {
      s = '$months months';
    } else {
      final years = months ~/ 12;
      final rem = months % 12;
      s = rem < 3 ? 'about $years year${years == 1 ? '' : 's'}' : rem < 9 ? 'over $years year${years == 1 ? '' : 's'}' : 'almost ${years + 1} years';
    }
  }
  return future ? 'in $s' : '$s ago';
}
