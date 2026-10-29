'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { setSessionToken } from '@/lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (typeof data.data?.token !== 'string') {
        throw new Error('Login response did not include an authentication token');
      }
      setSessionToken(data.data.token);
      window.location.assign('/home');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="grid w-full max-w-5xl overflow-hidden rounded-3xl shadow-xl md:grid-cols-2">
        <div className="hidden items-center justify-center bg-sky-50 p-8 md:flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/laptop-animation.svg" alt="DCT CRM" className="w-full max-w-md" />
        </div>
        <div className="flex flex-col justify-center p-2 md:p-8">
        <CardHeader className="space-y-1">
          <div className="mb-4 flex items-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-600">
              <span className="text-base font-bold text-white">DCT</span>
            </div>
          </div>
          <CardTitle className="text-3xl font-bold">Welcome to DCT CRM</CardTitle>
          <CardDescription className="text-[13px]">
            Enterprise Multi-Tenant CRM Platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <div className="p-2.5 text-[13px] text-red-600 bg-red-50 rounded-md">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@dctcrm.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
          <div className="mt-4 text-center text-[13px] text-muted-foreground">
            <p>Demo Credentials:</p>
            <p className="mt-1 font-mono text-xs">admin@dctcrm.com / password123</p>
          </div>
        </CardContent>
        </div>
      </Card>
    </div>
  );
}