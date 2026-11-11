// One entry for both screens: loaded lazily together, so what they share (copy, calls, hooks) stays in their chunk and out
// of the first load. Two separate lazy imports would move the shared code into __common, which every page loads.
export { MyOrganizationsScreen } from './MyOrganizationsScreen';
export { OrganizationRequestScreen } from './OrganizationRequestScreen';
