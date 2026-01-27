/**
 * Admin API barrel export
 * Centralized exports for all admin API modules
 */

import dashboardAPI from './dashboard'
import usersAPI from './users'
import settingsAPI from './settings'
import newAPI from './newapi'
import systemAPI from './system'
import geminiAPI from './gemini'
import antigravityAPI from './antigravity'
import userAttributesAPI from './userAttributes'
import opsAPI from './ops'
import inspirationAPI from './inspiration'

/**
 * Unified admin API object for convenient access
 */
export const adminAPI = {
  dashboard: dashboardAPI,
  users: usersAPI,
  settings: settingsAPI,
  newapi: newAPI,
  system: systemAPI,
  gemini: geminiAPI,
  antigravity: antigravityAPI,
  userAttributes: userAttributesAPI,
  ops: opsAPI,
  inspiration: inspirationAPI
}

export {
  dashboardAPI,
  usersAPI,
  settingsAPI,
  newAPI,
  systemAPI,
  geminiAPI,
  antigravityAPI,
  userAttributesAPI,
  opsAPI,
  inspirationAPI
}

export default adminAPI
