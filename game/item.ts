import items from "./items.json";

export type ItemId = keyof typeof items;
export {items};
