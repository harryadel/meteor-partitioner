ErrMsg = {
  userIdErr: "Must be logged in to operate on partitioned collection",
  groupErr: "Must have group assigned to operate on partitioned collection",
  groupFindErr: "User find operation attempted outside group context. " +
    "All operations must be wrapped with Partitioner.bindUserGroup() or Partitioner.bindGroup(). "
};

Helpers = {
  isDirectSelector: function(selector) {
    return typeof selector === 'string' || typeof (selector != null ? selector._id : undefined) === 'string';
  },

  // Because of https://github.com/HarvardEconCS/turkserver-meteor/issues/44
  // _id: { $in: [ ... ] } queries should be short-circuited as well for users
  isDirectUserSelector: function(selector) {
    return typeof selector === 'string' ||
      typeof (selector != null ? selector._id : undefined) === 'string' ||
      typeof (selector != null ? selector.username : undefined) === 'string' ||
      (typeof (selector != null ? selector._id : undefined) === 'object' && (selector != null ? selector._id : undefined) !== null && (selector._id.$in != null));
  }
}; 