/*
  SERVER METHODS
  Hook in group id to all operations, including find

  Grouping contains _id: userId and groupId: groupId
*/

Partitioner = {};

// Configuration options
Partitioner.config = {
  useMeteorUsers: false, // Set to true to use Meteor.users instead of separate Grouping collection
  groupingCollectionName: "ts.grouping", // Name of the grouping collection when not using Meteor.users
  disableUserManagementHooks: false // Set to true to disable hooks on user management operations when using Meteor.users
};

// Initialize collections based on configuration
const Grouping = new Mongo.Collection(Partitioner.config.groupingCollectionName);

// Meteor environment variables for scoping group operations
Partitioner._currentGroup = new Meteor.EnvironmentVariable();
Partitioner._isDirectGroupContext = new Meteor.EnvironmentVariable();
Partitioner._directOps = new Meteor.EnvironmentVariable();

// Helper functions to abstract collection operations
const GroupingHelpers = {
  async findOne(userId) {
    if (Partitioner.config.useMeteorUsers) {
      return await Meteor.users.findOneAsync(userId, { fields: { groupId: 1 } });
    } else {
      return await Grouping.findOneAsync(userId);
    }
  },

  async upsert(userId, updateDoc) {
    if (Partitioner.config.useMeteorUsers) {
      return await Meteor.users.upsertAsync(userId, updateDoc);
    } else {
      return await Grouping.upsertAsync(userId, updateDoc);
    }
  },

  async remove(userId) {
    if (Partitioner.config.useMeteorUsers) {
      return await Meteor.users.updateAsync(userId, { $unset: { groupId: 1 } });
    } else {
      return await Grouping.removeAsync(userId);
    }
  },

  observeChanges(callbacks) {
    if (Partitioner.config.useMeteorUsers) {
      return Meteor.users.find({ groupId: { $exists: true } }).observeChangesAsync(callbacks);
    } else {
      return Grouping.find().observeChangesAsync(callbacks);
    }
  }
};

// Configuration method
Partitioner.configure = function(options) {
  check(options, {
    useMeteorUsers: Match.Optional(Boolean),
    groupingCollectionName: Match.Optional(String),
    disableUserManagementHooks: Match.Optional(Boolean)
  });

  // Auto-disable conflicting configurations
  if (options.useMeteorUsers === true) {
    // When using Meteor.users, automatically disable separate collection features
    Partitioner.config.useMeteorUsers = true;
    Partitioner.config.disableUserManagementHooks = options.disableUserManagementHooks !== undefined ? 
      options.disableUserManagementHooks : Partitioner.config.disableUserManagementHooks;
    
    Meteor._debug("Configuration: Using Meteor.users collection for grouping. Separate grouping collection features disabled.");
  } else if (options.useMeteorUsers === false) {
    // When using separate collection, automatically disable Meteor.users specific features
    Partitioner.config.useMeteorUsers = false;
    Partitioner.config.disableUserManagementHooks = false; // Force disable when not using Meteor.users
    
    if (options.groupingCollectionName !== undefined) {
      Partitioner.config.groupingCollectionName = options.groupingCollectionName;
    }
    
    Meteor._debug("Configuration: Using separate grouping collection. Meteor.users specific features disabled.");
  } else {
    // Only update individual settings if useMeteorUsers is not explicitly set
    if (options.groupingCollectionName !== undefined) {
      Partitioner.config.groupingCollectionName = options.groupingCollectionName;
    }
    
    if (options.disableUserManagementHooks !== undefined) {
      Partitioner.config.disableUserManagementHooks = options.disableUserManagementHooks;
    }
  }

  // Validate final configuration
  if (Partitioner.config.useMeteorUsers && Partitioner.config.groupingCollectionName === "ts.grouping") {
    Meteor._debug("Note: Using Meteor.users for grouping. groupingCollectionName setting is ignored.");
  }

  if (Partitioner.config.disableUserManagementHooks && !Partitioner.config.useMeteorUsers) {
    Meteor._debug("Note: disableUserManagementHooks automatically disabled when not using Meteor.users collection.");
  }
};

/*
   Public API
*/

Partitioner.setUserGroup = async function(userId, groupId) {
  check(userId, String);
  check(groupId, String);
  if (await GroupingHelpers.findOne(userId)) {
    throw new Meteor.Error(403, "User is already in a group");
  }

  const result = await GroupingHelpers.upsert(userId, {
    $set: {groupId: groupId}
  });
  
  return result;
};

Partitioner.getUserGroup = async function(userId) {
  check(userId, String);
  const grouping = await GroupingHelpers.findOne(userId);
  return grouping != null ? grouping.groupId : undefined;
};

Partitioner.clearUserGroup = async function(userId) {
  check(userId, String);
  await GroupingHelpers.remove(userId);
};

Partitioner.group = async function() {
  // If group is overridden, return that instead
  const groupId = Partitioner._currentGroup.get();
  if (groupId != null) {
    return groupId;
  }
  let userId;
  try { // We may be outside of a method
    userId = Meteor.userId();
  } catch (e) {
    // Handle the case where we're outside of a method
  }
  if (!userId) return;
  return await Partitioner.getUserGroup(userId);
};

Partitioner.bindGroup = async function(groupId, func) {
  const result = await Partitioner._isDirectGroupContext.withValue(true, () => {
    return Partitioner._currentGroup.withValue(groupId, func);
  });
  return result;
};

Partitioner.bindUserGroup = async function(userId, func) {
  const groupId = await Partitioner.getUserGroup(userId);
  if (!groupId) {
    Meteor._debug(`Dropping operation because ${userId} is not in a group`);
    return;
  }
  const result = await Partitioner._isDirectGroupContext.withValue(false, () => {
    return Partitioner._currentGroup.withValue(groupId, func);
  });
  return result;
};

Partitioner.directOperation = async function(func) {
  return await Partitioner._directOps.withValue(true, func);
};

// This can be replaced - currently not documented
Partitioner._isAdmin = async function(userId) {
  const user = await Meteor.users.findOneAsync(userId, {fields: {groupId: 1, admin: 1}});
  return user.admin === true;
};

const getPartitionedIndex = function(index) {
  const defaultIndex = {_groupId: 1};
  if (!index) return defaultIndex;
  return Object.assign(defaultIndex, index);
};

Partitioner.partitionCollection = async function(collection, options) {
  // Because of the deny below, need to create an allow validator
  // on an insecure collection if there isn't one already
  if (collection._isInsecure()) {
    collection.allow({
      insert: () => true,
      update: () => true,
      remove: () => true
    });
  }

  // Idiot-proof the collection against admin users
  collection.deny({
    insert: Partitioner._isAdmin,
    update: Partitioner._isAdmin,
    remove: Partitioner._isAdmin
  });

  collection.before.find(findHook);
  collection.before.findOne(findHook);

  // These will hook the _validated methods as well
  collection.before.insert(insertHook);

  /*
    No update/remove hook necessary, see
    https://github.com/matb33/meteor-collection-hooks/issues/23
  */

  // Index the collections by groupId on the server for faster lookups across groups
  collection.createIndex(getPartitionedIndex(options != null ? options.index : undefined), options != null ? options.indexOptions : undefined);
};

// Publish admin and group for users that have it
Meteor.publish(null, function() {
  if (!this.userId) return;
  return Meteor.users.find(this.userId, {
    fields: {
      admin: 1,
      group: 1
    }
  });
});

// Special hook for Meteor.users to scope for each group
const userFindHook = function(userId, selector, options) {
  if (Partitioner._directOps.get() === true) return true;
  if (Helpers.isDirectUserSelector(selector)) return true;

  // Skip user management operations when configured to do so
  if (Partitioner.config.useMeteorUsers && Partitioner.config.disableUserManagementHooks) {
    const userManagementOps = ['createUser', 'findUserByEmail', 'findUserByUsername', '_attemptLogin'];
    if (userManagementOps.includes(this.name)) {
      return true; // Skip hook for user management operations
    }
  }

  let groupId = Partitioner._currentGroup.get();
  let isDirectGroupContext = Partitioner._isDirectGroupContext.get();
  // This hook doesn't run if we're not in a method invocation or publish
  // function, and Partitioner._currentGroup is not set
  if (!userId && !groupId) return true;
  if (!userId && !isDirectGroupContext) return true;
  
  if (!groupId) {
    // CANNOT do any async database calls here!
    // Must fail fast and require proper context setup
    Helpers.throwVerboseError(this, ErrMsg.groupFindErr, 'find');
  }

  // Since user is in a group, scope the find to the group
  const filter = {
    "group": groupId,
    "admin": {$exists: false}
  };

  if (!this.args[0]) {
    this.args[0] = filter;
  } else {
    Object.assign(this.args[0], filter);
  }

  return true;
};

// Attach the find hooks to Meteor.users
Meteor.users.before.find(userFindHook);
Meteor.users.before.findOne(userFindHook);

// No allow/deny for find so we make our own checks
const findHook = function(userId, selector, options) {
  // Don't scope for direct operations
  if (Partitioner._directOps.get() === true) return true;

  // for find(id) we should not touch this
  // TODO this may allow arbitrary finds across groups with the right _id
  // We could amend this in the future to {_id: someId, _groupId: groupId}
  // https://github.com/mizzao/meteor-partitioner/issues/9
  // https://github.com/mizzao/meteor-partitioner/issues/10
  if (Helpers.isDirectSelector(selector)) return true;

  // Check for global hook
  let groupId = Partitioner._currentGroup.get();

  if (!userId && !groupId) {
    throw new Meteor.Error(403, ErrMsg.userIdErr);
  }

  if (userId) {
    if (!groupId) {
      if (!userId) throw new Meteor.Error(403, ErrMsg.userIdErr);
      // CANNOT do any async database calls here!
      // Must fail fast and require proper context setup
      Helpers.throwVerboseError(this, ErrMsg.groupFindErr, 'find');
    }

    // if object (or empty) selector, just filter by group
    if (selector == null) {
      this.args[0] = {_groupId: groupId};
    } else {
      selector._groupId = groupId;
    }

    // Adjust options to not return _groupId
    if (options == null) {
      this.args[1] = {fields: {_groupId: 0}};
    } else {
      // If options already exist, add {_groupId: 0} unless fields has {foo: 1} somewhere
      if (options.fields == null) options.fields = {};
      if (!Object.values(options.fields).some((v) => v === 1)) {
        options.fields._groupId = 0;
      }
    }
  }

  return true;
};

const insertHook = async function(userId, doc) {
  // Don't add group for direct inserts
  if (Partitioner._directOps.get() === true) return true;

  let groupId = Partitioner._currentGroup.get();
  if (!groupId) {
    if (!userId) throw new Meteor.Error(403, ErrMsg.userIdErr);
    const grouping = await GroupingHelpers.findOne(userId);
    groupId = grouping?.groupId;
    if (!groupId) {
      Helpers.throwVerboseError(this, ErrMsg.groupErr, 'insert');
    }
  }

  doc._groupId = groupId;
  return true;
};

// Sync grouping needed for hooking Meteor.users
// Only sync when using separate grouping collection
if (!Partitioner.config.useMeteorUsers) {
  GroupingHelpers.observeChanges({
    added: async function(id, fields) {
      if (!await Meteor.users.updateAsync(id, {$set: {"group": fields.groupId}})) {
        Meteor._debug(`Tried to set group for nonexistent user ${id}`);
      }
    },
    changed: async function(id, fields) {
      if (!await Meteor.users.updateAsync(id, {$set: {"group": fields.groupId}})) {
        Meteor._debug(`Tried to change group for nonexistent user ${id}`);
      }
    },
    removed: async function(id) {
      if (!await Meteor.users.updateAsync(id, {$unset: {"group": null}})) {
        Meteor._debug(`Tried to unset group for nonexistent user ${id}`);
      }
    }
  });
}

TestFuncs = {
  getPartitionedIndex: getPartitionedIndex,
  userFindHook: userFindHook,
  findHook: findHook,
  insertHook: insertHook,
  Grouping: Grouping,
  GroupingHelpers: GroupingHelpers,
  config: Partitioner.config
}; 