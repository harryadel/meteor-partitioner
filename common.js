ErrMsg = {
  userIdErr: "Must be logged in to operate on partitioned collection",
  groupErr: "Must have group assigned to operate on partitioned collection",
  groupFindErr: "User find operation attempted outside group context. " +
    "All operations must be wrapped with Partitioner.bindUserGroup() or Partitioner.bindGroup(). ",
  multiGroupErr: "Operation attempted on collection that does not support multiple groups"
};

Helpers = {
  isDirectSelector: function(selector) {
    return typeof selector === 'string' || typeof (selector != null ? selector._id : undefined) === 'string';
  },
  
  // Helper function to detect login token verification queries
  isLoginTokenQuery: function(selector) {
    if (!selector || typeof selector !== 'object') return false;
    
    // Handle direct login token queries
    if (selector['services.resume.loginTokens.hashedToken'] !== undefined ||
        selector['services.resume.loginTokens.token'] !== undefined) {
      return true;
    }
    
    // Handle $or queries that contain login token conditions
    if (selector.$or && Array.isArray(selector.$or)) {
      return selector.$or.some(condition => 
        condition['services.resume.loginTokens.hashedToken'] !== undefined ||
        condition['services.resume.loginTokens.token'] !== undefined
      );
    }
    
    return false;
  },

  // Because of https://github.com/HarvardEconCS/turkserver-meteor/issues/44
  // _id: { $in: [ ... ] } queries should be short-circuited as well for users
  isDirectUserSelector: function(selector) {
    return typeof selector === 'string' ||
      typeof (selector != null ? selector._id : undefined) === 'string' ||
      typeof (selector != null ? selector.username : undefined) === 'string' ||
      (typeof (selector != null ? selector._id : undefined) === 'object' && (selector != null ? selector._id : undefined) !== null && (selector._id.$in != null)) ||
      // Handle login token verification during authentication
      Helpers.isLoginTokenQuery(selector);
  },

  // Helper function to warn about direct selector bypassing partition filter
  warnDirectSelectorBypass: function(hookContext, selector, reason) {
    const collectionName = hookContext.rawCollection?.().collectionName || hookContext._name || 'unknown';
    const operation = 'find';
    
    // Get stack trace to show where this is being called from
    const stack = new Error().stack;
    const stackLines = stack.split('\n');
    
    // Find the first meaningful line (skip internal frames)
    let callerLine = 'unknown';
    for (let i = 2; i < stackLines.length; i++) {
      const line = stackLines[i];
      // Skip internal/anonymous frames
      if (line.includes('packages/') || 
          line.includes('node_modules/') || 
          line.includes('(<anonymous>)') ||
          line.includes('Array.forEach')) {
        continue;
      }
      callerLine = line.trim();
      break;
    }
    
    console.warn(
      `[Partitioner Security Warning]\n` +
      `  Collection: ${collectionName}\n` +
      `  Operation: ${operation}\n` +
      `  Selector: ${JSON.stringify(selector)}\n` +
      `  Reason: ${reason}\n` +
      `  Called from: ${callerLine}\n` +
      `  Issue: Direct selector query bypassing partition filter.\n` +
      `  Risk: May allow cross-partition access.\n` +
      `  Fix: Wrap with Partitioner.bindUserGroup() or Partitioner.bindGroup().`
    );
  },

  // Helper function to log verbose error details and throw appropriate error
  throwVerboseError: function(hookContext, errorMessage, defaultOperation = 'unknown') {
    const operation = hookContext.name || defaultOperation;
    const collection = hookContext.collection?.name || 'unknown collection';
    const params = hookContext.args ? JSON.stringify(hookContext.args, null, 2) : 'no parameters';
    Meteor._debug(`Collection: ${collection}, Operation: ${operation}, Parameters: ${params}`);
    throw new Meteor.Error(403, errorMessage);
  }
}; 