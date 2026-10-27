import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Sesion } from '../lib/api';

const VENDEDOR_KEY = 'pos_vendedor';
const CLIENTE_KEY = 'pos_cliente';
const VENDEDOR_EXP_KEY = 'pos_vendedor_exp';
const CLIENTE_EXP_KEY = 'pos_cliente_exp';
const JORNADA_MS = 8 * 60 * 60 * 1000;
const RECUERDAME_MS = 30 * 24 * 60 * 60 * 1000;

interface AuthContextType {
  vendedor: Sesion | null;
  cliente: Sesion | null;
  loginVendedor: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  loginCliente: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setCliente: (sesion: Sesion | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function leerSesion(key: string, expKey: string): Sesion | null {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const exp = Number(localStorage.getItem(expKey) || '0');
    if (exp && Date.now() > exp) {
      localStorage.removeItem(key);
      localStorage.removeItem(expKey);
      return null;
    }
    return JSON.parse(stored) as Sesion;
  } catch {
    return null;
  }
}

function guardarSesion(key: string, expKey: string, sesion: Sesion, ttlMs: number) {
  localStorage.setItem(key, JSON.stringify(sesion));
  localStorage.setItem(expKey, String(Date.now() + ttlMs));
}

async function intentarRenovar(sesion: Sesion): Promise<Sesion> {
  try {
    const res = await fetch('/api/v1/usuarios/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: sesion.refreshToken }),
    });
    if (!res.ok) return sesion;
    const nueva = (await res.json()) as Sesion;
    return nueva.accessToken ? nueva : sesion;
  } catch {
    return sesion;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [vendedor, setVendedor] = useState<Sesion | null>(() => leerSesion(VENDEDOR_KEY, VENDEDOR_EXP_KEY));
  const [cliente, setCliente] = useState<Sesion | null>(() => leerSesion(CLIENTE_KEY, CLIENTE_EXP_KEY));

  useEffect(() => {
    if (vendedor) {
      localStorage.setItem(VENDEDOR_KEY, JSON.stringify(vendedor));
    } else {
      localStorage.removeItem(VENDEDOR_KEY);
      localStorage.removeItem(VENDEDOR_EXP_KEY);
    }
  }, [vendedor]);

  useEffect(() => {
    if (cliente) {
      localStorage.setItem(CLIENTE_KEY, JSON.stringify(cliente));
    } else {
      localStorage.removeItem(CLIENTE_KEY);
      localStorage.removeItem(CLIENTE_EXP_KEY);
    }
  }, [cliente]);

  // Renovación silenciosa al cargar la app si hay sesión vigente.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (vendedor?.refreshToken) {
        const renovada = await intentarRenovar(vendedor);
        if (!cancelado && renovada.accessToken !== vendedor.accessToken) {
          const exp = Number(localStorage.getItem(VENDEDOR_EXP_KEY) || '0');
          guardarSesion(VENDEDOR_KEY, VENDEDOR_EXP_KEY, renovada, Math.max(exp - Date.now(), JORNADA_MS));
          setVendedor(renovada);
        }
      }
    })();
    return () => {
      cancelado = true;
    };
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginVendedor = async (email: string, password: string, rememberMe = false) => {
    const { login } = await import('../lib/api');
    const sesion = await login(email, password);
    const rol = sesion.usuario.rol.toUpperCase();
    if (!['VENDEDOR', 'BODEGA', 'GERENTE'].includes(rol)) {
      throw new Error('La cuenta no tiene permisos para operar el POS');
    }
    guardarSesion(VENDEDOR_KEY, VENDEDOR_EXP_KEY, sesion, rememberMe ? RECUERDAME_MS : JORNADA_MS);
    setVendedor(sesion);
  };

  const loginCliente = async (email: string, password: string) => {
    const { login } = await import('../lib/api');
    const sesion = await login(email, password);
    const rol = sesion.usuario.rol.toUpperCase();
    if (rol !== 'CLIENTE') {
      throw new Error('La cuenta debe ser de rol CLIENTE');
    }
    guardarSesion(CLIENTE_KEY, CLIENTE_EXP_KEY, sesion, JORNADA_MS);
    setCliente(sesion);
  };

  const logout = () => {
    setVendedor(null);
    setCliente(null);
  };

  return (
    <AuthContext.Provider value={{ vendedor, cliente, loginVendedor, loginCliente, logout, setCliente }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
