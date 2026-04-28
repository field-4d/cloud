import React, { useEffect, useMemo, useState } from 'react';
import Select, { type StylesConfig } from 'react-select';
import { API_ENDPOINTS } from '../config';

type Role = 'read' | 'admin' | 'system_admin';
type Tab = 'new_user' | 'existing_user';
type PermissionMode = 'all' | 'new_user' | 'permission_assignment';

interface DeviceOption {
  owner: string;
  mac_address: string;
  device_name: string;
}

interface ExperimentOption {
  owner: string;
  mac_address: string;
  exp_name: string;
}

interface DeviceSelectOption {
  value: DeviceOption;
  label: string;
  searchText: string;
}

interface ExperimentSelectOption {
  value: ExperimentOption;
  label: string;
  searchText: string;
}

interface UserSearchOption {
  value: { email: string };
  label: string;
  searchText: string;
}

interface ExistingPermissionEntry {
  email: string;
  mac_address: string;
  experiment: string;
}

interface PermissionDashboardProps {
  isOpen?: boolean;
  onClose?: () => void;
  actorEmail: string;
  actorRole: Role;
  mode?: 'modal' | 'embedded';
  permissionMode?: PermissionMode;
}

const normalizeRole = (role: string): Role => {
  const cleaned = role.trim().toLowerCase();
  if (cleaned === 'system_admin') return 'system_admin';
  if (cleaned === 'admin') return 'admin';
  return 'read';
};

const PermissionDashboard: React.FC<PermissionDashboardProps> = ({
  isOpen = true,
  onClose,
  actorEmail,
  actorRole,
  mode = 'modal',
  permissionMode = 'all',
}) => {
  const defaultTab: Tab = permissionMode === 'permission_assignment' ? 'existing_user' : 'new_user';
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [firstName, setFirstName] = useState('');
  const [newUserMail, setNewUserMail] = useState('');
  const [existingUserMail, setExistingUserMail] = useState('');
  const [selectedExistingUsers, setSelectedExistingUsers] = useState<Array<{ email: string }>>([]);
  const [userSearchInput, setUserSearchInput] = useState('');
  const [userSearchOptions, setUserSearchOptions] = useState<UserSearchOption[]>([]);
  const [loadingUserSearch, setLoadingUserSearch] = useState(false);
  const [manualPassword, setManualPassword] = useState('');
  const [autoGeneratePassword, setAutoGeneratePassword] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<DeviceOption | null>(null);
  const [selectedExperiments, setSelectedExperiments] = useState<ExperimentOption[]>([]);
  const [roleVal, setRoleVal] = useState<Role>('read');
  const [sendEmail, setSendEmail] = useState(true);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [experiments, setExperiments] = useState<ExperimentOption[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [loadingExperiments, setLoadingExperiments] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existingPermissionEntries, setExistingPermissionEntries] = useState<ExistingPermissionEntry[]>([]);
  const [loadingExistingChecks, setLoadingExistingChecks] = useState(false);

  const canUsePermissionManagement = actorRole === 'admin' || actorRole === 'system_admin';
  const canCreateNewUsers = actorRole === 'system_admin';
  const showTabSwitcher = permissionMode === 'all';

  const deviceSelectOptions = useMemo<DeviceSelectOption[]>(
    () =>
      devices.map((device) => ({
        value: device,
        label: device.device_name,
        searchText: `${device.device_name} ${device.mac_address} ${device.owner}`.toLowerCase(),
      })),
    [devices]
  );

  const experimentSelectOptions = useMemo<ExperimentSelectOption[]>(
    () =>
      experiments.map((experiment) => ({
        value: experiment,
        label: experiment.exp_name,
        searchText: experiment.exp_name.toLowerCase(),
      })),
    [experiments]
  );

  const selectedDeviceOption = useMemo(
    () =>
      selectedDevice
        ? {
            value: selectedDevice,
            label: selectedDevice.device_name,
            searchText: `${selectedDevice.device_name} ${selectedDevice.mac_address} ${selectedDevice.owner}`.toLowerCase(),
          }
        : null,
    [selectedDevice]
  );

  const selectedExperimentOptions = useMemo<ExperimentSelectOption[]>(
    () =>
      selectedExperiments.map((experiment) => ({
        value: experiment,
        label: experiment.exp_name,
        searchText: experiment.exp_name.toLowerCase(),
      })),
    [selectedExperiments]
  );

  const selectedExistingUserOptions = useMemo<UserSearchOption[]>(
    () =>
      selectedExistingUsers.map((user) => ({
        value: user,
        label: user.email,
        searchText: user.email.toLowerCase(),
      })),
    [selectedExistingUsers]
  );

  const existingByUser = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const entry of existingPermissionEntries) {
      const email = entry.email.toLowerCase();
      if (!map.has(email)) map.set(email, new Set<string>());
      map.get(email)?.add(entry.experiment);
    }
    return map;
  }, [existingPermissionEntries]);

  const selectStyles: StylesConfig<any, boolean> = {
    control: (base, state) => ({
      ...base,
      minHeight: 42,
      borderColor: state.isFocused ? '#8ac6bb' : '#d1d5db',
      boxShadow: state.isFocused ? '0 0 0 1px #8ac6bb' : 'none',
      '&:hover': {
        borderColor: '#8ac6bb',
      },
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? '#f1f7f5' : '#ffffff',
      color: '#1f2937',
      cursor: 'pointer',
    }),
    menu: (base) => ({
      ...base,
      zIndex: 60,
    }),
  };

  const normalizeApiError = (raw: string) => {
    const msg = raw.toLowerCase();
    if (msg.includes('already exists') && msg.includes('user')) return "User already exists. Use 'Existing User' tab.";
    if (msg.includes('does not exist') && msg.includes('user')) return "User does not exist. Use 'New User' tab.";
    if (msg.includes('permission already exists')) return 'Permission already exists.';
    if (msg.includes('not authorized') || msg.includes('permission denied')) return 'Not authorized for this action.';
    return raw;
  };

  const isWildcardRole = roleVal === 'admin' || roleVal === 'system_admin';
  const requiresExperimentSelection = roleVal === 'read';

  const isRoleSelected = ['read', 'admin', 'system_admin'].includes(roleVal);
  const isExistingUserReady =
    (activeTab === 'existing_user' || permissionMode === 'permission_assignment') &&
    selectedExistingUsers.length > 0 &&
    !!selectedDevice &&
    (!requiresExperimentSelection || selectedExperiments.length > 0) &&
    isRoleSelected;
  const isNewUserReady =
    (activeTab === 'new_user' || permissionMode === 'new_user') &&
    canCreateNewUsers &&
    !!firstName.trim() &&
    !!newUserMail.trim() &&
    !!selectedDevice &&
    (!requiresExperimentSelection || selectedExperiments.length > 0) &&
    isRoleSelected &&
    (autoGeneratePassword || !!manualPassword.trim());

  useEffect(() => {
    if (!isOpen || !canUsePermissionManagement) return;
    const loadDevices = async () => {
      setLoadingDevices(true);
      setError(null);
      try {
        const response = await fetch(
          `${API_ENDPOINTS.PERMISSION_MANAGE_DEVICES}?actor_email=${encodeURIComponent(actorEmail)}`
        );
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.detail || data.message || 'Failed to load devices');
        }
        setDevices(Array.isArray(data.devices) ? data.devices : []);
      } catch (err) {
        setError(err instanceof Error ? normalizeApiError(err.message) : 'Failed to load devices');
      } finally {
        setLoadingDevices(false);
      }
    };
    loadDevices();
  }, [isOpen, actorEmail, canUsePermissionManagement]);

  useEffect(() => {
    if (!selectedDevice) {
      setExperiments([]);
      setSelectedExperiments([]);
      return;
    }
    const loadExperiments = async () => {
      setLoadingExperiments(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          actor_email: actorEmail,
          owner: selectedDevice.owner,
          mac_address: selectedDevice.mac_address,
        });
        const response = await fetch(`${API_ENDPOINTS.PERMISSION_MANAGE_EXPERIMENTS}?${params.toString()}`);
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.detail || data.message || 'Failed to load experiments');
        }
        setExperiments(Array.isArray(data.experiments) ? data.experiments : []);
      } catch (err) {
        setError(err instanceof Error ? normalizeApiError(err.message) : 'Failed to load experiments');
      } finally {
        setLoadingExperiments(false);
      }
    };
    loadExperiments();
  }, [selectedDevice, actorEmail]);

  useEffect(() => {
    if (isWildcardRole && selectedExperiments.length > 0) {
      setSelectedExperiments([]);
    }
  }, [isWildcardRole, selectedExperiments.length]);

  useEffect(() => {
    if (activeTab !== 'existing_user') return;
    const searchTerm = userSearchInput.trim().toLowerCase();
    if (searchTerm.length < 2) {
      setUserSearchOptions([]);
      setLoadingUserSearch(false);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setLoadingUserSearch(true);
      try {
        const params = new URLSearchParams({
          q: searchTerm,
          actor_email: actorEmail,
        });
        const token = localStorage.getItem('jwtToken');
        const response = await fetch(`${API_ENDPOINTS.USERS_SEARCH}?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || data.message || 'Failed to search users');
        }
        const options: UserSearchOption[] = (Array.isArray(data) ? data : []).map((user) => ({
          value: { email: user.email },
          label: user.email,
          searchText: String(user.email || '').toLowerCase(),
        }));
        setUserSearchOptions(options);
      } catch (err) {
        setError(err instanceof Error ? normalizeApiError(err.message) : 'Failed to search users');
      } finally {
        setLoadingUserSearch(false);
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [userSearchInput, actorEmail, activeTab]);

  useEffect(() => {
    if (activeTab !== 'existing_user') {
      setExistingPermissionEntries([]);
      return;
    }
    if (!selectedDevice || selectedExistingUsers.length === 0 || experiments.length === 0) {
      setExistingPermissionEntries([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setLoadingExistingChecks(true);
      try {
        const response = await fetch(API_ENDPOINTS.PERMISSION_CHECK_EXISTING, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            actor_email: actorEmail,
            users: selectedExistingUsers.map((u) => u.email),
            mac_address: selectedDevice.mac_address,
            experiments: experiments.map((exp) => exp.exp_name),
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || data.message || 'Failed to check existing permissions');
        }
        setExistingPermissionEntries(Array.isArray(data.existing) ? data.existing : []);
      } catch (err) {
        setError(err instanceof Error ? normalizeApiError(err.message) : 'Failed to check existing permissions');
      } finally {
        setLoadingExistingChecks(false);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [activeTab, selectedDevice, selectedExistingUsers, experiments, actorEmail]);

  useEffect(() => {
    if (permissionMode === 'permission_assignment') {
      setActiveTab('existing_user');
      return;
    }
    if (permissionMode === 'new_user') {
      setActiveTab('new_user');
      return;
    }
  }, [permissionMode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!canUsePermissionManagement) {
      setError('Not authorized for permission management.');
      return;
    }
    if (activeTab === 'new_user' && !canCreateNewUsers) {
      setError('Only system_admin can create new users.');
      return;
    }
    if (!selectedDevice || (requiresExperimentSelection && selectedExperiments.length === 0)) {
      setError('Please select a device and experiment.');
      return;
    }
    if (activeTab === 'new_user' && (!firstName.trim() || !newUserMail.trim())) {
      setError('Please enter first name and email.');
      return;
    }
    if (activeTab === 'existing_user' && !existingUserMail.trim()) {
      setError('Please enter an existing user email.');
      return;
    }
    if (!autoGeneratePassword && activeTab === 'new_user' && !manualPassword.trim()) {
      setError('Please enter a password or choose auto-generate.');
      return;
    }

    setSubmitting(true);
    try {
      const endpoint =
        activeTab === 'new_user'
          ? API_ENDPOINTS.PERMISSION_MANAGE_NEW_USER
          : API_ENDPOINTS.PERMISSION_MANAGE_EXISTING_USERS_BATCH;
      const body =
        activeTab === 'new_user'
          ? {
              actor_email: actorEmail,
              first_name: firstName,
              user_mail: newUserMail,
              password: autoGeneratePassword ? undefined : manualPassword,
              auto_generate_password: autoGeneratePassword,
              owner: selectedDevice.owner,
              mac_address: selectedDevice.mac_address,
              exp_name: isWildcardRole ? '*' : selectedExperiments[0].exp_name,
              role_val: roleVal,
              send_email: sendEmail,
            }
          : (() => {
              const users = selectedExistingUsers.map((u) => u.email.toLowerCase());
              if (isWildcardRole) {
                return {
                  actor_email: actorEmail,
                  user_mails: users,
                  owner: selectedDevice.owner,
                  mac_address: selectedDevice.mac_address,
                  exp_names: ['*'],
                  role_val: roleVal,
                  send_email: sendEmail,
                };
              }
              const experimentsToAdd = selectedExperiments.map((exp) => exp.exp_name);
              const nonDuplicatePairs = users.flatMap((email) =>
                experimentsToAdd
                  .filter((expName) => !existingByUser.get(email)?.has(expName))
                  .map((expName) => ({ email, expName }))
              );
              const uniqueUsers = Array.from(new Set(nonDuplicatePairs.map((pair) => pair.email)));
              const uniqueExperiments = Array.from(new Set(nonDuplicatePairs.map((pair) => pair.expName)));
              return {
                actor_email: actorEmail,
                user_mails: uniqueUsers,
                owner: selectedDevice.owner,
                mac_address: selectedDevice.mac_address,
                exp_names: uniqueExperiments,
                role_val: roleVal,
                send_email: sendEmail,
              };
            })();

      if (
        activeTab === 'existing_user' &&
        !isWildcardRole &&
        (!Array.isArray(body.user_mails) || body.user_mails.length === 0 || !Array.isArray(body.exp_names) || body.exp_names.length === 0)
      ) {
        const totalSelected = selectedExistingUsers.length * selectedExperiments.length;
        setMessage(`Added 0 permission(s). Already existed: ${totalSelected}. Failed: 0.`);
        setSubmitting(false);
        return;
      }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      const isBatchMode = activeTab === 'existing_user';
      const batchItems = Array.isArray(data?.items) ? data.items : [];
      const batchAllNonFatal =
        batchItems.length > 0 &&
        batchItems.every(
          (item: any) => item?.status === 'added' || item?.status === 'already_existed' || item?.status === 'skipped'
        );
      const batchSuccessLike =
        response.ok &&
        typeof data === 'object' &&
        data !== null &&
        ((typeof data.added === 'number' && data.added > 0) ||
          (typeof data.failed === 'number' && data.failed === 0) ||
          batchAllNonFatal ||
          data.success === true);

      if (!response.ok || (isBatchMode ? !batchSuccessLike : !data.success)) {
        throw new Error(normalizeApiError(data.detail || data.message || 'Request failed'));
      }

      setMessage(
        activeTab === 'new_user'
          ? 'New user created and permission assigned successfully.'
          : `Added ${data.added || 0} permission(s). Already existed: ${data.already_existed || 0}. Failed: ${data.failed || 0}.`
      );
      setNewUserMail('');
      setExistingUserMail('');
      setSelectedExistingUsers([]);
      setUserSearchInput('');
      setUserSearchOptions([]);
      setFirstName('');
      setManualPassword('');
      setSelectedExperiments([]);
    } catch (err) {
      setError(err instanceof Error ? normalizeApiError(err.message) : 'Failed to process request');
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === 'modal' && !isOpen) return null;
  const isEmbedded = mode === 'embedded';
  if (!canUsePermissionManagement) {
    return (
      <div className={isEmbedded ? "w-full rounded-xl bg-white p-6 shadow" : "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"}>
        <div className={isEmbedded ? "w-full rounded-xl bg-white p-6" : "w-full max-w-xl rounded-xl bg-white p-6 shadow-2xl"}>
          <h3 className="text-xl font-semibold text-gray-800">Permission Management</h3>
          <p className="mt-2 text-sm text-gray-600">
            Signed in as {actorEmail} ({actorRole})
          </p>
          <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            You are not authorized to manage users or permissions.
          </div>
          {!isEmbedded && onClose && (
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-gray-200 px-4 py-2 text-sm text-gray-800 hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={isEmbedded ? "w-full" : "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"}>
      <div className={isEmbedded ? "w-full rounded-xl bg-white p-6 shadow" : "w-full max-w-4xl rounded-xl bg-white p-6 shadow-2xl"}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Permission Management</h3>
            <p className="text-sm text-gray-500">Signed in as {actorEmail} ({actorRole})</p>
          </div>
          {!isEmbedded && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
            >
              Close
            </button>
          )}
        </div>
        {showTabSwitcher && (
          <div className="mb-5 flex gap-2">
            {canCreateNewUsers && (
              <button
                type="button"
                onClick={() => setActiveTab('new_user')}
                className={`rounded-md px-4 py-2 text-sm ${
                  activeTab === 'new_user' ? 'bg-[#8ac6bb] text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                New User
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('existing_user')}
              className={`rounded-md px-4 py-2 text-sm ${
                activeTab === 'existing_user' ? 'bg-[#8ac6bb] text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Existing User
            </button>
          </div>
        )}

        <form className="space-y-5" onSubmit={submit}>
          {activeTab === 'new_user' ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <input
                className="rounded border border-gray-300 p-2"
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
              <input
                className="rounded border border-gray-300 p-2"
                type="email"
                placeholder="New user email"
                value={newUserMail}
                onChange={(e) => setNewUserMail(e.target.value)}
                required
              />
              <div className="md:col-span-2 grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={autoGeneratePassword}
                    onChange={(e) => setAutoGeneratePassword(e.target.checked)}
                  />
                  Auto-generate password
                </label>
                <input
                  className="rounded border border-gray-300 p-2 disabled:bg-gray-100"
                  type="text"
                  placeholder="Manual password"
                  value={manualPassword}
                  onChange={(e) => setManualPassword(e.target.value)}
                  disabled={autoGeneratePassword}
                  required={!autoGeneratePassword}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Select<UserSearchOption, true>
                  options={userSearchOptions}
                  value={selectedExistingUserOptions}
                  onInputChange={(value, meta) => {
                    if (meta.action === 'input-change') {
                      setUserSearchInput(value);
                    }
                  }}
                  inputValue={userSearchInput}
                  onChange={(options) => {
                    const selected = (options || []).map((option) => option.value);
                    setSelectedExistingUsers(selected);
                    setExistingUserMail(selected.map((u) => u.email).join(','));
                  }}
                  isMulti
                  isSearchable
                  isClearable
                  isLoading={loadingUserSearch}
                  placeholder="Search and select users..."
                  noOptionsMessage={() =>
                    userSearchInput.trim().length < 2
                      ? 'Type at least 2 characters'
                      : 'No matching users'
                  }
                  styles={selectStyles}
                  filterOption={null}
                />
              {selectedExistingUsers.length > 0 && (
                <div className="rounded-lg border border-[#b2b27a] bg-[#f7f8f3] p-3">
                  <p className="mb-2 text-sm font-medium text-[#5f6b45]">
                    {selectedExistingUsers.length === 1 ? 'Selected user:' : 'Selected users:'}
                  </p>
                  <div className="space-y-2">
                    {selectedExistingUsers.map((user) => (
                      <div
                        key={user.email}
                        className="flex items-center justify-between gap-3 rounded-md border border-gray-300 bg-white px-3 py-2"
                      >
                        <span className="text-sm font-medium text-gray-900 break-all">{user.email}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = selectedExistingUsers.filter((u) => u.email !== user.email);
                            setSelectedExistingUsers(updated);
                            setExistingUserMail(updated.map((u) => u.email).join(','));
                          }}
                          className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
                          aria-label={`Remove ${user.email}`}
                        >
                          X
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 space-y-1">
                    {selectedExistingUsers.map((user) => {
                      const alreadyHas = Array.from(existingByUser.get(user.email.toLowerCase()) || []);
                      return (
                        <p key={`hint-${user.email}`} className="text-xs text-[#5f6b45]">
                          {user.email} - Already has: {alreadyHas.length > 0 ? alreadyHas.join(' / ') : 'None on this device'}
                        </p>
                      );
                    })}
                  </div>
                </div>
              )}
              {selectedExistingUsers.length === 1 && (
                <p className="text-sm text-[#5f6b45]">Selected user: {selectedExistingUsers[0].email}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Select<DeviceSelectOption, false>
                options={deviceSelectOptions}
                value={selectedDeviceOption}
                onChange={(option) => {
                  setSelectedDevice(option?.value ?? null);
                  setSelectedExperiments([]);
                }}
                isSearchable
                isClearable
                isDisabled={loadingDevices}
                placeholder={loadingDevices ? 'Loading devices...' : 'Search device name...'}
                noOptionsMessage={() => 'No devices found'}
                styles={selectStyles}
                filterOption={(candidate, input) =>
                  candidate.data.searchText.includes(input.toLowerCase())
                }
              />
              {selectedDevice && (
                <p className="rounded border border-[#b2b27a] bg-[#f7f8f3] px-3 py-2 text-sm text-[#5f6b45]">
                  Selected device: {selectedDevice.device_name} ({selectedDevice.mac_address})
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Select<ExperimentSelectOption, true>
                options={experimentSelectOptions}
                value={selectedExperimentOptions}
                onChange={(options) => setSelectedExperiments((options || []).map((option) => option.value))}
                isMulti
                isSearchable
                isClearable
                isDisabled={!selectedDevice || loadingExperiments || isWildcardRole}
                placeholder={
                  isWildcardRole
                    ? 'Not required for admin/system_admin'
                    : !selectedDevice
                    ? 'Select device first'
                    : loadingExperiments
                    ? 'Loading experiments...'
                    : 'Search experiment(s)...'
                }
                noOptionsMessage={() => 'No experiments found'}
                styles={selectStyles}
                isOptionDisabled={(option) =>
                  activeTab === 'existing_user' &&
                  selectedExistingUsers.length > 0 &&
                  selectedExistingUsers.every((user) =>
                    existingByUser.get(user.email.toLowerCase())?.has(option.value.exp_name)
                  )
                }
                formatOptionLabel={(option) => {
                  const duplicateForAll =
                    activeTab === 'existing_user' &&
                    selectedExistingUsers.length > 0 &&
                    selectedExistingUsers.every((user) =>
                      existingByUser.get(user.email.toLowerCase())?.has(option.value.exp_name)
                    );
                  return duplicateForAll ? `${option.label} (already assigned to selected users)` : option.label;
                }}
                filterOption={(candidate, input) =>
                  candidate.data.searchText.includes(input.toLowerCase())
                }
              />
              {activeTab === 'existing_user' && loadingExistingChecks && (
                <p className="text-xs text-[#5f6b45]">Checking existing permissions...</p>
              )}
              {roleVal === 'admin' && (
                <p className="rounded border border-[#b2b27a] bg-[#f7f8f3] px-3 py-2 text-sm text-[#5f6b45]">
                  Admin applies to all experiments on this device
                </p>
              )}
              {roleVal === 'system_admin' && (
                <p className="rounded border border-[#b2b27a] bg-[#f7f8f3] px-3 py-2 text-sm text-[#5f6b45]">
                  System admin applies to all experiments
                </p>
              )}
              {selectedExperiments.length > 0 && (
                <p className="rounded border border-[#b2b27a] bg-[#f7f8f3] px-3 py-2 text-sm text-[#5f6b45]">
                  {selectedExperiments.length === 1
                    ? `Selected experiment: ${selectedExperiments[0].exp_name}`
                    : `Selected experiments: ${selectedExperiments.map((e) => e.exp_name).join(', ')}`}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <select
              className="rounded border border-gray-300 p-2"
              value={roleVal}
              onChange={(e) => setRoleVal(normalizeRole(e.target.value))}
            >
              <option value="read">read</option>
              <option value="admin">admin</option>
              <option value="system_admin">system_admin</option>
            </select>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
              />
              Send email notification
            </label>
          </div>

          {error && <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}
          {message && <div className="rounded border border-green-200 bg-green-50 p-2 text-sm text-green-700">{message}</div>}

          <div className="flex justify-end">
            <button
              type="submit"
              className="w-full rounded bg-[#8ac6bb] px-4 py-2 text-white hover:bg-[#7ab6ab] disabled:opacity-50 sm:w-auto"
              disabled={submitting || !(isExistingUserReady || isNewUserReady)}
            >
              {submitting ? 'Adding...' : 'Add Permission'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PermissionDashboard;
