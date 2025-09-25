/*
  SERVER METHODS
  Hook in group id to all operations, including find

  Grouping contains _id: userId and groupId: groupId
*/

Partitioner = {};
// allowDirectIdSelectors is now managed through Partitioner.config
const multipleGroupCollections = {}

// Configuration options
Partitioner.config = {
  useMeteorUsers: false, // Set to true to use Meteor.users instead of separate Grouping collection
  groupingCollectionName: "ts.grouping", // Name of the grouping collection when not using Meteor.users
  disableUserManagementHooks: false, // Set to true to disable hooks on user management operations when using Meteor.users
  allowDirectIdSelectors: false, // Set to true to allow direct id selectors
};

// Initialize collections based on configuration
const Grouping = new Mongo.Collection(Partitioner.config.groupingCollectionName);

// Meteor environment variables for scoping group operations
Partitioner._currentGroup = new Meteor.EnvironmentVariable();
Partitioner._isDirectGroupContext = new Meteor.EnvironmentVariable();
Partitioner._directOps = new Meteor.EnvironmentVariable();
Partitioner._searchAllUsers = new Meteor.EnvironmentVariable();

// Helper functions to abstract collection operations
const GroupingHelpers = {
  async findOne(userId) {
    if (Partitioner.config.useMeteorUsers) {
      const user = await Meteor.users.direct.findOneAsync(userId, { fields: { group: 1 } });
      return user?.group; // Safe null access
    } else {
      const grouping = await Grouping.direct.findOneAsync(userId);
      return grouping?.groupId; // Safe null access
    }
  },

  async upsert(userId, updateDoc) {
    if (Partitioner.config.useMeteorUsers) {
      return await Meteor.users.direct.upsertAsync(userId, updateDoc);
    } else {
      return await Grouping.direct.upsertAsync(userId, updateDoc);
    }
  },

  async remove(userId) {
    if (Partitioner.config.useMeteorUsers) {
      return await Meteor.users.direct.updateAsync(userId, { $unset: { group: 1 } });
    } else {
      return await Grouping.direct.removeAsync(userId);
    }
  },

  observeChanges(callbacks) {
    if (Partitioner.config.useMeteorUsers) {
      return Meteor.users.direct.find({ groupId: { $exists: true } }).observeChangesAsync(callbacks);
    } else {
      return Grouping.direct.find().observeChangesAsync(callbacks);
    }
  }
};

// Configuration method
Partitioner.configure = function(options) {
  check(options, {
    useMeteorUsers: Match.Optional(Boolean),
    groupingCollectionName: Match.Optional(String),
    disableUserManagementHooks: Match.Optional(Boolean),
    allowDirectIdSelectors: Match.Optional(Boolean)
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

    if (options.allowDirectIdSelectors !== undefined) {
      Partitioner.config.allowDirectIdSelectors = options.allowDirectIdSelectors;
    }
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
  return await GroupingHelpers.findOne(userId);
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
  const user = await Meteor.users.direct.findOneAsync(userId, {fields: {groupId: 1, admin: 1}});
  return user.admin === true;
};

const getPartitionedIndex = function(index) {
  const defaultIndex = {_groupId: 1};
  if (!index) return defaultIndex;
  return Object.assign(defaultIndex, index);
};

Partitioner.partitionCollection = async function(collection, options = {}) {
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
  collection.before.insert((userId, doc) => insertHook(options.multipleGroups, userId, doc));
  collection.before.upsert((userId, selector, modifier) => upsertHook(options.multipleGroups, userId, selector, modifier));

  /*
    No update/remove hook necessary, see
    https://github.com/matb33/meteor-collection-hooks/issues/23
  */
 // store a hash of which collections allow multiple groups
 if (options.multipleGroups) {
  multipleGroupCollections[collection._name] = true;
}

// Index the collections by groupId on the server for faster lookups across groups
return collection.createIndex ? collection.createIndex(getPartitionedIndex(options.index), options.indexOptions)
  : collection._ensureIndex(getPartitionedIndex(options.index), options.indexOptions);
};

Partitioner.getAllowDirectIdSelectors = function() {
  return Partitioner.config.allowDirectIdSelectors;
};

Partitioner.setAllowDirectIdSelectors = function(val) {
  if (typeof val != 'boolean') {
    throw new Error('Partitioner.allowDirectIdSelectors can only be boolean');
  }
  Partitioner.config.allowDirectIdSelectors = val;
  if (val) {
    console.warn('WARNING: setting Partitioner.allowDirectIdSelectors = true may allow unsafe operations!');
  }
};

Partitioner.addToGroup = async function(collection, entityId, groupId) {
  if (!multipleGroupCollections[collection._name]) {
    throw new Meteor.Error(403, ErrMsg.multiGroupErr);
  }

  let currentGroupIds = collection.direct.findOne(entityId, {fields: {_groupId: 1}})?._groupId;
  if (!currentGroupIds) {
    currentGroupIds = [groupId];
  } else if (typeof currentGroupIds == 'string') {
    currentGroupIds = [currentGroupIds];
  }

  if (currentGroupIds.indexOf(groupId) == -1) {
    currentGroupIds.push(groupId);
    collection.direct.update(entityId, {$set: {_groupId: currentGroupIds}});
  }
  return currentGroupIds;
};

Partitioner.removeFromGroup = async function(collection, entityId, groupId) {
  if (!multipleGroupCollections[collection._name]) {
    throw new Meteor.Error(403, ErrMsg.multiGroupErr);
  }

  let currentGroupIds = collection.direct.findOne(entityId, {fields: {_groupId: 1}})?._groupId;
  if (!currentGroupIds) {
    return [];
  }

  if (typeof currentGroupIds == 'string') {
    currentGroupIds = [currentGroupIds];
  }
  const index = currentGroupIds.indexOf(groupId);
  if (index != -1) {
    currentGroupIds.splice(index, 1);
    collection.direct.update(entityId, {$set: {_groupId: currentGroupIds}});
  }

  return currentGroupIds;
};

// Publish admin and group for users that have it
Meteor.publish(null, function() {
  return Meteor.users.direct.find(this.userId, {
    fields: {
      admin: 1,
      group: 1
    }
  });
});

// Special hook for Meteor.users to scope for each group
const userFindHook = function(userId, selector, options) {
  const isDirectSelector = Helpers.isDirectUserSelector(selector);
if (
  ((Partitioner.config.allowDirectIdSelectors || Partitioner._searchAllUsers.get()) && isDirectSelector)
  || Partitioner._directOps.get() === true
) return true;

  let groupId = Partitioner._currentGroup.get();
  let isDirectGroupContext = Partitioner._isDirectGroupContext.get();
  // This hook doesn't run if we're not in a method invocation or publish
  // function, and Partitioner._currentGroup is not set
  if (!userId && !groupId) return true;
  if (!userId && !isDirectGroupContext) return true;
  
  // Handle queries specifically looking for users without groups
  if (!groupId && selector && selector.group === null) {
    // Allow the query to proceed unchanged - it's specifically looking for ungrouped users
    return true;
  }
  
  if (!groupId) {
    // debugger;
    // CANNOT do any async database calls here!
    // Must fail fast and require proper context setup
    Helpers.throwVerboseError(this, ErrMsg.groupFindErr, 'find');
  }
  // debugger;
  // Since user is in a group, scope the find to the group
  filter = {
		"group": groupId,
	};
	if (!isDirectSelector) {
		filter.admin = {$exists: false}
	}
	if (selector == null) {
		this.args[0] = filter;
	} else if (typeof selector == 'string') {
		filter._id = selector;
		this.args[0] = filter;
	} else {
		Object.assign(selector, filter);
	}

  return true;
};

// No allow/deny for find so we make our own checks
const findHook = function(userId, selector, options) {
  // Don't scope for direct operations
  // for find(id) we should not touch this
  // TODO this may allow arbitrary finds across groups with the right _id
  // We could amend this in the future to {_id: someId, _groupId: groupId}
  // https://github.com/mizzao/meteor-partitioner/issues/9
  // https://github.com/mizzao/meteor-partitioner/issues/10
  if (Partitioner._directOps.get() === true || (Partitioner.config.allowDirectIdSelectors && Helpers.isDirectSelector(selector))) return true;

  
  // Check for global hook
  let groupId = Partitioner._currentGroup.get();

  if (!userId && !groupId) {
    throw new Meteor.Error(403, ErrMsg.userIdErr);
  }

  if (userId) {
    if (!groupId) {
      // debugger;
      if (!userId) throw new Meteor.Error(403, ErrMsg.userIdErr);
      // CANNOT do any async database calls here!
      // Must fail fast and require proper context setup
      // debugger;
      Helpers.throwVerboseError(this, ErrMsg.groupFindErr, 'find');
    }
    // debugger;
    
     // force the selector to scope for the _groupId
      if (selector == null) {
        this.args[0] = {
          _groupId: groupId,
        };
      } else if (typeof selector == 'string') {
        this.args[0] = {
          _id: selector,
          _groupId: groupId,
        };
      } else {
        selector._groupId = groupId;
      }

      // Adjust options to not return _groupId
      if (options == null) {
        this.args[1] = {fields: {_groupId: 0}};
      } else {
        // If options already exist, add {_groupId: 0} unless fields has {foo: 1} somewhere
        if (options.fields == null) options.fields = {};
        if (!Object.values(options.fields).some(v => v)) options.fields._groupId = 0;
      }
  }

  return true;
};

const insertHook = async function(multipleGroups, userId, doc) {
  // Don't add group for direct inserts
  if (Partitioner._directOps.get() === true) return true;

  let groupId = Partitioner._currentGroup.get();
  if (!groupId) {
    if (!userId) throw new Meteor.Error(403, ErrMsg.userIdErr);
    groupId = await GroupingHelpers.findOne(userId);
    if (!groupId) {
      // debugger;
      Helpers.throwVerboseError(this, ErrMsg.groupErr, 'insert');
    }
  }

  // Handle multipleGroups: array vs string
  doc._groupId = multipleGroups ? [groupId] : groupId;
  return true;
};

const upsertHook = async function(multipleGroups, userId, selector, modifier) {
  // Don't add group for direct upserts
  if (Partitioner._directOps.get() === true) return true;

  let groupId = Partitioner._currentGroup.get();
  if (!groupId) {
    if (!userId) throw new Meteor.Error(403, ErrMsg.userIdErr);
    groupId = await GroupingHelpers.findOne(userId);
    if (!groupId) {
      // debugger;
      Helpers.throwVerboseError(this, ErrMsg.groupErr, 'upsert');
    }
  }

  // Handle multipleGroups: array vs string
  // For upserts, we need to add to $set
  if (!modifier.$set) modifier.$set = {};
  modifier.$set._groupId = multipleGroups ? [groupId] : groupId;
  return true;
};

const userInsertHook = async function(userId, doc) {
  // Don't add group for direct inserts
  if (Partitioner._directOps.get() === true) return true;

  let groupId = Partitioner._currentGroup.get();
  if (!groupId) {
    if (!userId) throw new Meteor.Error(403, ErrMsg.userIdErr);
    groupId = await GroupingHelpers.findOne(userId);
    if (!groupId) {
      // debugger;
      Helpers.throwVerboseError(this, ErrMsg.groupErr, 'insert');
    }
  }

  // For users, we use 'group' field instead of '_groupId'
  doc.group = groupId;
  return true;
};

const userUpsertHook = async function(userId, selector, modifier) {
  // Don't add group for direct upserts
  if (Partitioner._directOps.get() === true) return true;

  let groupId = Partitioner._currentGroup.get();
  if (!groupId) {
    if (!userId) throw new Meteor.Error(403, ErrMsg.userIdErr);
    groupId = await GroupingHelpers.findOne(userId);
    if (!groupId) {
      // debugger;
      Helpers.throwVerboseError(this, ErrMsg.groupErr, 'upsert');
    }
  }

  // For users, we use 'group' field instead of '_groupId'
  if (!modifier.$set) modifier.$set = {};
  modifier.$set.group = groupId;
  return true;
};

// Attach the find hooks to Meteor.users 
Meteor.users.before.find(userFindHook);
Meteor.users.before.findOne(userFindHook);

// Insert/upsert hooks only needed when using Meteor.users to store group info
if (Partitioner.config.useMeteorUsers) {
  Meteor.users.before.insert(userInsertHook);
  Meteor.users.before.upsert(userUpsertHook);
}


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

// Accounts.createUser, etc, checks for case-insensitive matches of the email address
// however, it uses Meteor.users.find which only operates on the partitioned collection
// so will not find a matching user in a different group.
// Hence make them use Meteor.users._partitionerDirect.find instead.
// Don't wrap createUser with Partitioner.directOperation because want inserted user doc to be
// automatically assigned to the group
if (Partitioner.config.useMeteorUsers) {
  ['createUser', 'findUserByEmail', 'findUserByUsername', '_attemptLogin'].forEach(fn => {
    const orig = Accounts[fn];
    if (orig) {
      Accounts[fn] = function() {
        return Partitioner._searchAllUsers.withValue(true, () => orig.apply(this, arguments));
      };
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