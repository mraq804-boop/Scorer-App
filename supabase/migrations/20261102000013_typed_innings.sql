alter domain public.match_event_type drop constraint match_event_type_check;
alter domain public.match_event_type add constraint match_event_type_check check (value in (
  'match_created', 'player_added', 'innings_started', 'delivery', 'batter_in', 'bowler_changed',
  'strike_swapped', 'retired', 'settings_changed', 'innings_ended', 'undo', 'correct', 'innings_entered'
));
