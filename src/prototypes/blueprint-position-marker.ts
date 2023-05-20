/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Data } from "typed-factorio/data/types"
import { Prototypes } from "../constants"
import { ItemPrototype, TilePrototype } from "../declarations/data"

declare const data: Data

const labTileWhite: TilePrototype = data.raw.tile["lab-white"]

const blueprintPositionMarker: TilePrototype = {
  ...labTileWhite,
  name: Prototypes.BlueprintPositionMarker,
  collision_mask: [],

  minable: { mining_time: 0.1 },
  can_be_part_of_blueprint: true,
  check_collision_with_entities: false,

  icon: "__core__/graphics/spawn-flag.png",
  icon_size: 64,
}

const blueprintPositionMarkerItem: ItemPrototype = {
  type: "item",
  name: Prototypes.BlueprintPositionMarker,
  icon: "__core__/graphics/spawn-flag.png",
  icon_size: 64,
  stack_size: 1,
  flags: ["hidden"],
  place_as_tile: {
    result: Prototypes.BlueprintPositionMarker,
    condition_size: 0,
    condition: [],
  },
}

data.extend([blueprintPositionMarker, blueprintPositionMarkerItem])
