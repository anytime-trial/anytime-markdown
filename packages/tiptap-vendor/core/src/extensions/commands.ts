import * as commands from '../commands/index'
import { Extension } from '../Extension'

export * from '../commands/index'

export const Commands = Extension.create({
  name: 'commands',

  addCommands() {
    return {
      ...commands,
    }
  },
})
