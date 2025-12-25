/**
 * UI Module Index
 * Exports all UI mixins for composition
 */

export { TerminalMixin } from './terminal.js';
export { InputMixin } from './input.js';
export { PanelsMixin } from './panels.js';
export { ModalMixin } from './modal.js';
export { InitFlowMixin, ROLE_ICONS } from './initFlow.js';
export { ModernUIMixin } from './modernUI.js';

/**
 * Apply a mixin to a class prototype
 * @param {Function} targetClass - The class to extend
 * @param {Object} mixin - The mixin object containing methods
 */
export function applyMixin(targetClass, mixin) {
  Object.getOwnPropertyNames(mixin).forEach(name => {
    if (name !== 'constructor') {
      Object.defineProperty(
        targetClass.prototype,
        name,
        Object.getOwnPropertyDescriptor(mixin, name) || Object.create(null)
      );
    }
  });
}

/**
 * Apply multiple mixins to a class
 * @param {Function} targetClass - The class to extend
 * @param {...Object} mixins - The mixins to apply
 */
export function applyMixins(targetClass, ...mixins) {
  mixins.forEach(mixin => applyMixin(targetClass, mixin));
}
