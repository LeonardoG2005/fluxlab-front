/**
 * Account Settings Page
 *
 * Allows authenticated users to update their personal data and password.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  faCheck,
  faEye,
  faEyeSlash,
  faLock,
  faSpinner,
  faUser,
  faXmark
} from '@fortawesome/free-solid-svg-icons';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { updateUser, updateUserPassword } from '../services/userService';

const PROFILE_INITIAL_STATE = {
  name: '',
  email: '',
  role: ''
};

const NAME_MIN_LENGTH = 5;
const NAME_ALLOWED_REGEX = /^[\p{L}\s]+$/u;
const EMAIL_MAX_LENGTH = 254;
const EMAIL_LOCAL_MAX_LENGTH = 64;
const EMAIL_LABEL_MAX_LENGTH = 63;
const EMAIL_LOCAL_ALLOWED_REGEX = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;

function resolveUserId(user) {
  return user?.id || user?.sub || user?.user_id || '';
}

function getRoleDisplayLabel(role) {
  switch (role) {
    case 'technician':
      return 'Técnico';
    case 'researcher':
      return 'Investigador';
    case 'admin':
      return 'Administrador';
    default:
      return role || 'Usuario';
  }
}

function getNameValidationError(value) {
  const trimmedValue = String(value || '').trim();

  if (!trimmedValue) {
    return 'El nombre es obligatorio.';
  }

  if (trimmedValue.length < NAME_MIN_LENGTH) {
    return 'El nombre debe tener al menos 5 caracteres.';
  }

  if (!NAME_ALLOWED_REGEX.test(trimmedValue)) {
    return 'El nombre solo puede contener letras y espacios.';
  }

  return '';
}

function getEmailValidationError(value) {
  const trimmedValue = String(value || '').trim();

  if (!trimmedValue) {
    return 'El correo es obligatorio.';
  }

  if (trimmedValue.length > EMAIL_MAX_LENGTH) {
    return 'El correo excede la longitud permitida.';
  }

  if (/\s/.test(trimmedValue)) {
    return 'El correo no puede contener espacios.';
  }

  const emailParts = trimmedValue.split('@');

  if (emailParts.length !== 2) {
    return 'El correo debe contener un solo "@".';
  }

  const [localPart, domainPart] = emailParts;

  if (!localPart || !domainPart) {
    return 'El correo debe incluir usuario y dominio.';
  }

  if (localPart.length > EMAIL_LOCAL_MAX_LENGTH) {
    return 'La parte antes del "@" es demasiado larga.';
  }

  if (!EMAIL_LOCAL_ALLOWED_REGEX.test(localPart)) {
    return 'El correo contiene caracteres invalidos.';
  }

  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return 'La parte antes del "@" no puede iniciar, terminar o repetir puntos.';
  }

  if (domainPart.includes('..')) {
    return 'El dominio no puede contener puntos dobles.';
  }

  const domainLabels = domainPart.split('.');

  if (domainLabels.length < 2) {
    return 'El dominio debe incluir una extension valida.';
  }

  for (const label of domainLabels) {
    if (!label.length || label.length > EMAIL_LABEL_MAX_LENGTH) {
      return 'El dominio contiene una seccion con longitud invalida.';
    }

    if (!/^[A-Za-z0-9-]+$/.test(label)) {
      return 'El dominio contiene caracteres invalidos.';
    }

    if (label.startsWith('-') || label.endsWith('-')) {
      return 'El dominio no puede iniciar o terminar con guion.';
    }
  }

  const topLevelDomain = domainLabels[domainLabels.length - 1];

  if (!/^[A-Za-z]{2,63}$/.test(topLevelDomain)) {
    return 'La extension del dominio no es valida.';
  }

  return '';
}

export default function AccountSettingsPage() {
  const { user, updateUserProfile } = useAuth();
  const [profileForm, setProfileForm] = useState(PROFILE_INITIAL_STATE);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordErrors, setPasswordErrors] = useState([]);
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const userId = resolveUserId(user);
  const roleLabel = getRoleDisplayLabel(user?.app_metadata?.role || user?.role);

  useEffect(() => {
    if (!user) {
      return;
    }

    setProfileForm({
      name: user?.name || '',
      email: user?.email || '',
      role: roleLabel
    });
  }, [user, roleLabel]);

  const passwordValidations = {
    minLength: newPassword.length >= 8,
    hasNumber: /\d/.test(newPassword),
    hasSpecialChar: /[^A-Za-z0-9]/.test(newPassword),
    hasUpperAndLower: /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword)
  };

  const passwordValidationItems = useMemo(() => (
    [
      {
        key: 'minLength',
        label: 'La contraseña debe tener minimo 8 caracteres',
        isValid: passwordValidations.minLength
      },
      {
        key: 'hasNumber',
        label: 'La contraseña debe contener al menos 1 numero',
        isValid: passwordValidations.hasNumber
      },
      {
        key: 'hasSpecialChar',
        label: 'La contraseña debe contener al menos 1 caracter especial',
        isValid: passwordValidations.hasSpecialChar
      },
      {
        key: 'hasUpperAndLower',
        label: 'La contraseña debe contener al menos 1 mayuscula y 1 minuscula',
        isValid: passwordValidations.hasUpperAndLower
      }
    ]
  ), [passwordValidations.hasNumber, passwordValidations.hasSpecialChar, passwordValidations.hasUpperAndLower, passwordValidations.minLength]);

  const isPasswordComplex = passwordValidationItems.every((validation) => validation.isValid);
  const passwordsMatch = newPassword !== '' && confirmPassword !== '' && newPassword === confirmPassword;
  const completedComplexityRules = passwordValidationItems.filter((validation) => validation.isValid).length;
  const totalPasswordProgressSteps = passwordValidationItems.length + 1;
  const completedPasswordProgressSteps = completedComplexityRules + (passwordsMatch ? 1 : 0);
  const passwordProgressPercent = (completedPasswordProgressSteps / totalPasswordProgressSteps) * 100;
  const isReadyForPasswordUpdate = isPasswordComplex && passwordsMatch;
  const canSubmitPassword = Boolean(currentPassword) && isReadyForPasswordUpdate && !updatingPassword;

  const isProfileDirty = useMemo(() => {
    if (!user) {
      return false;
    }

    const currentName = String(user?.name || '').trim();
    const currentEmail = String(user?.email || '').trim();

    return (
      profileForm.name.trim() !== currentName
      || profileForm.email.trim() !== currentEmail
    );
  }, [profileForm.email, profileForm.name, user]);

  const handleProfileChange = (event) => {
    const { name, value } = event.target;
    setProfileForm((current) => ({
      ...current,
      [name]: value
    }));
    if (profileError) {
      setProfileError('');
    }
    if (profileSuccess) {
      setProfileSuccess('');
    }
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setProfileError('');
    setProfileSuccess('');

    if (!userId) {
      setProfileError('No fue posible identificar al usuario autenticado.');
      return;
    }

    const trimmedName = profileForm.name.trim();
    const nameValidationError = getNameValidationError(trimmedName);
    const trimmedEmail = profileForm.email.trim();
    const emailValidationError = getEmailValidationError(trimmedEmail);

    if (nameValidationError) {
      setProfileError(nameValidationError);
      return;
    }

    if (emailValidationError) {
      setProfileError(emailValidationError);
      return;
    }

    setSavingProfile(true);

    try {
      const updatedUser = await updateUser(userId, {
        name: trimmedName,
        email: trimmedEmail
      });

      updateUserProfile({
        ...updatedUser,
        name: updatedUser?.name || trimmedName,
        email: updatedUser?.email || trimmedEmail
      });

      setProfileForm((current) => ({
        ...current,
        name: trimmedName,
        email: trimmedEmail
      }));

      setProfileSuccess('Datos personales actualizados correctamente.');
    } catch (err) {
      setProfileError(String(err?.message || 'No fue posible actualizar los datos personales.'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordErrors([]);
    setPasswordSuccess('');

    if (!userId) {
      setPasswordError('No fue posible identificar al usuario autenticado.');
      return;
    }

    if (!currentPassword) {
      setPasswordError('Ingresa tu contraseña actual.');
      return;
    }

    if (!newPassword) {
      setPasswordError('Ingresa la nueva contraseña.');
      return;
    }

    if (!confirmPassword) {
      setPasswordError('Confirma la nueva contraseña.');
      return;
    }

    const submitErrors = [];

    if (!isPasswordComplex) {
      submitErrors.push('La nueva contraseña no cumple los requisitos de complejidad.');
    }

    if (!passwordsMatch) {
      submitErrors.push('Las contraseñas nuevas no coinciden.');
    }

    if (submitErrors.length > 0) {
      setPasswordErrors(submitErrors);
      return;
    }

    setUpdatingPassword(true);

    try {
      await updateUserPassword(userId, currentPassword, newPassword);
      updateUserProfile({ passwordChanged: true });
      setPasswordSuccess('Contraseña actualizada correctamente.');
      setPasswordErrors([]);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(String(err?.message || 'No fue posible actualizar la contraseña.'));
    } finally {
      setUpdatingPassword(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar />

        <main className="flex-1 overflow-auto">
          <div className="p-6 md:p-8 space-y-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Configuración de la cuenta</h1>
              <p className="text-gray-600 mt-1">Actualiza tu información personal y tu seguridad.</p>
            </div>

            <section className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
              <div className="mb-6">
                <h2 className="text-lg font-bold text-gray-900">Datos personales</h2>
                <p className="text-sm text-gray-600 mt-1">Actualiza el nombre asociado a tu cuenta.</p>
              </div>

              {profileError && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{profileError}</p>
                </div>
              )}

              {profileSuccess && (
                <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <p className="text-sm text-emerald-700">{profileSuccess}</p>
                </div>
              )}

              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="name"
                      value={profileForm.name}
                      onChange={handleProfileChange}
                      placeholder="Tu nombre completo"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <Icon icon={faUser} size={14} color="currentColor" />
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={profileForm.email}
                    onChange={handleProfileChange}
                    placeholder="tu.correo@dominio.com"
                    disabled={savingProfile}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rol
                  </label>
                  <input
                    type="text"
                    value={profileForm.role}
                    disabled
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingProfile || !isProfileDirty}
                  className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2 rounded-lg font-medium transition ${
                    savingProfile || !isProfileDirty
                      ? 'bg-gray-100 text-gray-500 border border-gray-200 cursor-not-allowed'
                      : 'bg-emerald-500 text-black shadow-lg shadow-emerald-400/50 hover:bg-emerald-600 hover:text-white'
                  }`}
                >
                  {savingProfile ? (
                    <>
                      <Icon icon={faSpinner} spin size={14} color="currentColor" />
                      Guardando...
                    </>
                  ) : (
                    'Guardar cambios'
                  )}
                </button>
              </form>
            </section>

            <section className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
              <div className="mb-6">
                <h2 className="text-lg font-bold text-gray-900">Cambiar contraseña</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Verifica tu contraseña actual y define una nueva con los requisitos de seguridad.
                </p>
              </div>

              {passwordError && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{passwordError}</p>
                </div>
              )}

              {passwordErrors.map((message, index) => (
                <div key={`${message}-${index}`} className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{message}</p>
                </div>
              ))}

              {passwordSuccess && (
                <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <p className="text-sm text-emerald-700">{passwordSuccess}</p>
                </div>
              )}

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contraseña actual
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      placeholder="********"
                      value={currentPassword}
                      onChange={(event) => {
                        setCurrentPassword(event.target.value);
                        if (passwordError) {
                          setPasswordError('');
                        }
                        if (passwordErrors.length) {
                          setPasswordErrors([]);
                        }
                      }}
                      disabled={updatingPassword}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword((current) => !current)}
                      disabled={updatingPassword}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showCurrentPassword ? (
                        <Icon icon={faEyeSlash} size={14} color="currentColor" />
                      ) : (
                        <Icon icon={faEye} size={14} color="currentColor" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nueva contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      placeholder="********"
                      value={newPassword}
                      onChange={(event) => {
                        setNewPassword(event.target.value);
                        if (passwordError) {
                          setPasswordError('');
                        }
                        if (passwordErrors.length) {
                          setPasswordErrors([]);
                        }
                      }}
                      disabled={updatingPassword}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((current) => !current)}
                      disabled={updatingPassword}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showNewPassword ? (
                        <Icon icon={faEyeSlash} size={14} color="currentColor" />
                      ) : (
                        <Icon icon={faEye} size={14} color="currentColor" />
                      )}
                    </button>
                  </div>

                  <ul className="mt-3 space-y-2">
                    {passwordValidationItems.map((validation) => (
                      <li key={validation.key} className="flex items-center gap-2">
                        <span
                          className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
                            validation.isValid ? 'bg-emerald-500' : 'bg-red-500'
                          }`}
                        >
                          <Icon
                            icon={validation.isValid ? faCheck : faXmark}
                            size={10}
                            color="white"
                          />
                        </span>
                        <span
                          className={`text-xs ${
                            validation.isValid ? 'text-emerald-700' : 'text-gray-600'
                          }`}
                        >
                          {validation.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confirmar contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="********"
                      value={confirmPassword}
                      onChange={(event) => {
                        setConfirmPassword(event.target.value);
                        if (passwordError) {
                          setPasswordError('');
                        }
                        if (passwordErrors.length) {
                          setPasswordErrors([]);
                        }
                      }}
                      disabled={updatingPassword}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((current) => !current)}
                      disabled={updatingPassword}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? (
                        <Icon icon={faEyeSlash} size={14} color="currentColor" />
                      ) : (
                        <Icon icon={faEye} size={14} color="currentColor" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="w-full h-2.5 bg-gray-200 overflow-hidden rounded-full">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300 shadow-[0_0_10px_rgba(16,185,129,0.45)]"
                    style={{ width: `${passwordProgressPercent}%` }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={updatingPassword}
                  className={`w-full font-medium rounded-lg px-6 py-2 transition-all duration-200 flex items-center justify-center gap-2 ${
                    canSubmitPassword
                      ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-400/50 hover:bg-emerald-600 hover:text-white'
                      : 'bg-gray-100 text-gray-700 border border-gray-300'
                  }`}
                >
                  {updatingPassword ? (
                    <>
                      <Icon icon={faSpinner} spin size={14} color="currentColor" />
                      Cambiando...
                    </>
                  ) : (
                    <>
                      <Icon icon={faLock} size={14} color="currentColor" />
                      Cambiar contraseña
                    </>
                  )}
                </button>
              </form>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
