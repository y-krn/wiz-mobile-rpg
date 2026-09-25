// balance-impact: none — retire the stone-event contract; remaining event IDs are unchanged.
export const EVENT_TYPES = {
  CHEST: "chest",
  SPRING: "event_spring",
  CAMP: "event_camp",
  MERCHANT: "event_merchant",
  RETURN_PORTAL: "return_portal",
  MIDBOSS: "midboss",
  BOSS: "boss"
};

export const EVENT_SUBMENU_TYPES = [
  "event_spring",
  "event_camp",
  "event_merchant",
  "event_merchant_buy",
  "milestone_merchant",
  "milestone_portal"
];

export const ITEM_SUBMENU_TYPES = [
  "item_inventory",
  "item_target_select",
  "item_direction_select"
];

export const TRAP_TYPES = {
  DAMAGE: "damage",
  MP_DRAIN: "mpDrain",
  ALARM: "alarm",
  PITFALL: "pitfall"
};
