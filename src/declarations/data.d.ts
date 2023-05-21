/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

export interface PrototypeBase {
  name: string
  type: string
  localised_name?: LocalisedString
  localised_description?: LocalisedString

  order?: string
}
export interface Sound {
  // stub type
  _sound: never
}

export interface EntityPrototype extends PrototypeBase {
  flags?: Array<keyof EntityPrototypeFlags>

  icons?: IconData[]
  icon_size?: number
  icon_mipmaps?: number
  icon?: string

  subgroup?: string

  selection_box?: BoundingBoxWrite | BoundingBoxArray
  collision_box?: BoundingBoxWrite | BoundingBoxArray
  collision_mask?: Array<keyof CollisionMaskWithFlags>
  tile_height?: number
  tile_width?: number
  selectable_in_game?: boolean

  build_grid_size?: 1 | 2

  open_sound?: Sound
  close_sound?: Sound

  placeable_by?: ItemToPlace

  map_color?: Color
  friendly_map_color?: Color
  enemy_map_color?: Color

  minable?: MinableProperties
  remains_when_mined?: string
}

export interface SimpleEntityPrototype extends EntityPrototype {
  type: "simple-entity"
  picture?: Sprite
  render_layer?: RenderLayer
}
export interface SimpleEntityWithOwnerPrototype extends EntityPrototype {
  type: "simple-entity-with-owner"
  create_ghost_on_death?: boolean
  picture?: Sprite | Sprite4Way
  render_layer?: RenderLayer
  secondary_draw_order?: number
}
export interface CorpsePrototype extends EntityPrototype {
  time_before_removed?: number
  remove_on_entity_placement?: boolean
  remove_on_tile_placement?: boolean
  final_render_layer?: RenderLayer
}
export interface RailRemnantsPrototype extends CorpsePrototype {
  type: "rail-remnants"
  secondary_collision_box?: BoundingBoxWrite | BoundingBoxArray
  bending_type: "straight" | "turn"
  pictures: {
    straight_rail_horizontal: RailPieceLayers
    straight_rail_vertical: RailPieceLayers
    straight_rail_diagonal_left_top: RailPieceLayers
    straight_rail_diagonal_right_top: RailPieceLayers
    straight_rail_diagonal_right_bottom: RailPieceLayers
    straight_rail_diagonal_left_bottom: RailPieceLayers
    curved_rail_vertical_left_top: RailPieceLayers
    curved_rail_vertical_right_top: RailPieceLayers
    curved_rail_vertical_right_bottom: RailPieceLayers
    curved_rail_vertical_left_bottom: RailPieceLayers
    curved_rail_horizontal_left_top: RailPieceLayers
    curved_rail_horizontal_right_top: RailPieceLayers
    curved_rail_horizontal_right_bottom: RailPieceLayers
    curved_rail_horizontal_left_bottom: RailPieceLayers
    rail_endings: Sprite8Way
  }
}
export interface RailPieceLayers {
  metals: Sprite
  backplates: Sprite
  ties: Sprite
  stone_path: Sprite
}

export interface TilePrototype extends PrototypeBase {
  type: "tile"
  collision_mask?: Array<keyof CollisionMaskWithFlags>
  layer: number
  variants: unknown
  map_color: Color | ColorArray
  pollution_absorption_per_second: number

  minable?: MinableProperties
  can_be_part_of_blueprint: boolean
  check_collision_with_entities: boolean

  icon?: string
  icons?: IconData[]
  icon_size?: number
}

export interface ItemPrototype extends PrototypeBase {
  icons?: IconData[]
  icon_size?: number
  icon_mipmaps?: number
  icon?: string

  subgroup?: string

  stack_size: number
  flags?: Array<keyof ItemPrototypeFlags>
  place_result?: string
  place_as_tile?: {
    result: string
    condition_size: number
    condition: CollisionMaskLayer[]
  }
}
export interface SelectionToolPrototype extends Omit<ItemPrototype, "type"> {
  type: "selection-tool"

  draw_label_for_cursor_render?: boolean

  selection_color: Color | ColorArray
  alt_selection_color: Color | ColorArray
  selection_mode: SelectionMode[]
  alt_selection_mode: SelectionMode[]
  selection_cursor_box_type: CursorBoxRenderType
  alt_selection_cursor_box_type: CursorBoxRenderType

  reverse_selection_color?: Color | ColorArray
  reverse_selection_mode?: SelectionMode[]
  reverse_selection_cursor_box_type?: CursorBoxRenderType

  entity_filters?: string[]
  alt_entity_filters?: string[]
  reverse_entity_filters?: string[]

  entity_filter_mode?: "whitelist" | "blacklist"
  alt_entity_filter_mode?: "whitelist" | "blacklist"
  reverse_entity_filter_mode?: "whitelist" | "blacklist"

  alt_reverse_selection_color?: Color | ColorArray
  alt_reverse_selection_mode?: SelectionMode[]
  alt_reverse_selection_cursor_box_type?: CursorBoxRenderType
  alt_reverse_entity_filters?: string[]
  alt_reverse_entity_filter_mode?: "whitelist" | "blacklist"
}
type SelectionMode =
  | "blueprint"
  | "deconstruct"
  | "cancel-deconstruct"
  | "items"
  | "trees"
  | "buildable-type"
  | "nothing"
  | "items-to-place"
  | "any-entity"
  | "any-tile"
  | "same-force"
  | "not-same-force"
  | "friend"
  | "enemy"
  | "upgrade"
  | "cancel-upgrade"
  | "downgrade"
  | "entity-with-health"
  | "entity-with-force"
  | "entity-with-owner"
  | "avoid-rolling-stock"

export interface DeconstructionItemPrototype extends Omit<SelectionToolPrototype, "type"> {
  type: "deconstruction-item"

  entity_filter_count?: number
  tile_filter_count?: number

  always_include_tiles?: never
  entity_filters?: never
  entity_type_filters?: never
  tile_filters?: never
  entity_filter_mode?: never
  tile_filter_mode?: never
  alt_entity_filters?: never
  alt_entity_type_filters?: never
  alt_tile_filters?: never
  alt_entity_filter_mode?: never
  alt_tile_filter_mode?: never
}
export interface CustomInputPrototype extends PrototypeBase {
  type: "custom-input"

  key_sequence: string
  linked_game_control?: string
  item_to_spawn?: string
  action?:
    | "lua"
    | "spawn-item"
    | "toggle-personal-roboport"
    | "toggle-personal-logistic-requests"
    | "toggle-equipment-movement-bonus"
}

export interface ShortcutPrototype extends PrototypeBase {
  type: "shortcut"
  action:
    | "toggle-alt-mode"
    | "undo"
    | "copy"
    | "cut"
    | "paste"
    | "import-string"
    | "toggle-personal-roboport"
    | "toggle-equipment-movement-bonus"
    | "spawn-item"
    | "lua"
  icon: Sprite
  item_to_spawn?: string
  associated_control_input?: string
  style?: "default" | "blue" | "red" | "green"
}

export interface ItemGroupPrototype extends PrototypeBase {
  type: "item-group"
  icon: string
  icon_size: number
}
export interface ItemSubgroupPrototype extends PrototypeBase {
  type: "item-subgroup"
  group: string
}

export interface SpritePrototypeBase extends PrototypeBase {
  type: "sprite"
  name: string
}
export interface BasicSpritePrototype extends SpritePrototypeBase, BasicSprite {}
export interface LayeredSpritePrototype extends SpritePrototypeBase, LayeredSprite {}

export type SpritePrototype = BasicSpritePrototype | LayeredSpritePrototype

export interface SoundPrototype extends PrototypeBase {
  type: "sound"
  category?: "game-effect" | "gui-effect" | "ambient" | "environment" | "walking" | "alert" | "wind"
  aggregation?: {
    max_count: number
    progress_threshold: number
    remove: boolean
    count_already_playing: boolean
  }

  allow_random_repeat?: boolean
  audible_distance_modifier?: number
  // variations
  filename?: string
  volume?: number
  preload?: boolean
  speed?: number
  min_speed?: number
  max_speed?: number
}

export interface BasicSprite {
  filename: string
  priority?: SpritePriority

  width?: number
  height?: number
  size?: number | MapPosition | MapPositionArray
  shift?: MapPosition | MapPositionArray
  position?: MapPositionArray
  scale?: number

  mipmap_count?: number

  tint?: Color | ColorArray

  flags?: SpriteFlag[]
}
export interface LayeredSprite {
  layers: Sprite[]
}
export type Sprite = BasicSprite | LayeredSprite
export type SpritePriority = "extra-high-no-scale" | "extra-high" | "high" | "medium" | "low" | "very-low" | "no-atlas"
export type SpriteFlag = "terrain-effect-map" | "terrain" | "icon" | "group=none"
export interface Sprite4Way {
  north: Sprite
  east: Sprite
  south: Sprite
  west: Sprite
}
// export interface BasicSprite8Way {}
export interface Sprite8Way {
  sheet: Sprite
}

export interface IconData {
  icon: string
  icon_size?: number
  tint?: Color | ColorArray
  shift?: MapPosition | MapPositionArray
  scale?: number
  icon_mipmaps?: number
}

export interface ItemToPlace {
  item: string
  count: number
}

export interface MinableProperties {
  mining_time: number
  result?: string
}

export interface UtilityConstants {
  chart: {
    default_friendly_color: Color
    default_friendly_color_by_type: Partial<Record<string, Color>>
    rail_color: Color
  }
}
