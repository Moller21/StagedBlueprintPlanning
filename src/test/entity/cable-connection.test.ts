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

import expect from "tstl-expect"
import { createAssemblyEntity } from "../../entity/AssemblyEntity"
import { getEntityOfConnectionPoint, isPowerSwitchConnectionPoint } from "../../entity/cable-connection"

test("isPowerSwitchConnectionPoint", () => {
  const entity = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, nil, 1)

  expect(isPowerSwitchConnectionPoint(entity)).toBe(false)
  expect(isPowerSwitchConnectionPoint({ entity, connectionId: 1 })).toBe(true)
})

test("getEntityOfConnectionPoint", () => {
  const entity = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, nil, 1)

  expect(getEntityOfConnectionPoint(entity)).toBe(entity)
  expect(getEntityOfConnectionPoint({ entity, connectionId: 1 })).toBe(entity)
})
