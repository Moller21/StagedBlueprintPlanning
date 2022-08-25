/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { BBox } from "../lib/geometry"
import { WorldArea } from "../lib/world-area"

export function testArea(index: number): WorldArea {
  return {
    surface: game.surfaces[1],
    bbox: BBox.coords(index * 100, 0, 100 + index * 100, 100),
  }
}

export function clearTestArea(index: number = 0): WorldArea {
  const area = testArea(index)
  clearArea(area)
  return area
}

export function clearArea(worldArea: WorldArea): void {
  worldArea.surface.find_entities_filtered({ area: worldArea.bbox }).forEach((e) => e.destroy())
}
