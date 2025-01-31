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

/** @noSelfInFile */

import { MapPosition, MapPositionArray } from "factorio:runtime"
import * as util from "util"
import { WithMetatable } from "../util-types"

// Down is positive y, right is positive x

const setmetatable = globalThis.setmetatable
const _floor = math.floor
const _ceil = math.ceil

export type Position = MapPosition

export interface PositionClass extends WithMetatable<Position, typeof Pos> {}

function Pos(x: number, y: number): PositionClass {
  return setmetatable({ x, y }, meta)
}

namespace Pos {
  import sqrt = math.sqrt
  export function from(position: Position): PositionClass {
    return setmetatable({ x: position.x, y: position.y }, meta)
  }
  export function load(position: Position): PositionClass {
    return setmetatable(position, meta)
  }
  export function normalize(pos: MapPosition | MapPositionArray): PositionClass
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  export function normalize(p: any): PositionClass {
    return Pos(p.x || p[1], p.y || p[2])
  }

  export function plus(pos1: Position, pos2: Position): PositionClass {
    return Pos(pos1.x + pos2.x, pos1.y + pos2.y)
  }
  export function add(pos: Position, x: number, y: number): PositionClass {
    return Pos(pos.x + x, pos.y + y)
  }
  export function minus(pos1: Position, pos2: Position): PositionClass {
    return Pos(pos1.x - pos2.x, pos1.y - pos2.y)
  }
  export function times(pos1: Position, factor: number): PositionClass {
    return Pos(pos1.x * factor, pos1.y * factor)
  }
  export function div(pos1: Position, factor: number): PositionClass {
    return Pos(pos1.x / factor, pos1.y / factor)
  }
  export function emul(pos1: Position, pos2: Position): PositionClass {
    return Pos(pos1.x * pos2.x, pos1.y * pos2.y)
  }
  export function ediv(pos1: Position, pos2: Position): PositionClass {
    return Pos(pos1.x / pos2.x, pos1.y / pos2.y)
  }
  export function floor(pos1: Position): PositionClass {
    return Pos(_floor(pos1.x), _floor(pos1.y))
  }
  export function ceil(pos1: Position): PositionClass {
    return Pos(_ceil(pos1.x), _ceil(pos1.y))
  }
  export function length(pos1: Position): number {
    return sqrt(pos1.x * pos1.x + pos1.y * pos1.y)
  }
  export function equals(pos1: Position, pos2: Position): boolean {
    return pos1.x == pos2.x && pos1.y == pos2.y
  }
  export function isZero(pos1: Position): boolean {
    return pos1.x == 0 && pos1.y == 0
  }
  export function rotateAboutOrigin(pos1: Position, direction: defines.direction | nil): PositionClass {
    if (direction == nil || direction == defines.direction.north) return Pos.from(pos1)
    if (direction == defines.direction.south) return Pos(-pos1.x, -pos1.y)
    if (direction == defines.direction.west) return Pos(pos1.y, -pos1.x)
    if (direction == defines.direction.east) return Pos(-pos1.y, pos1.x)
    error(`invalid direction: ${defines.direction[direction]}`)
  }
  export function asArray(pos1: Position): MapPositionArray {
    return [pos1.x, pos1.y]
  }
}

const meta: LuaMetatable<Position, PositionClass> = {
  __index: Pos as any,
  __tostring: util.positiontostr as any,
}

export { Pos }
