import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

export default function PostOnboarding() {
  const [, setLocation] = useLocation();

  React.useEffect(() => {
    // Clear onboarding context after arriving
    try { localStorage.removeItem('chainsync_onboarding'); } catch {}
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-bold">You're almost there!</CardTitle>
          <CardDescription>
            Your payment was successful! Your account is now active and ready to use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-gray-600">
            We sent a welcome email with your account details. You can now log in and start using ChainSync!
          </p>
          <div className="flex flex-col space-y-2">
            <Button onClick={() => setLocation('/login')} className="w-full">Login to ChainSync</Button>
            <Button variant="outline" onClick={() => setLocation('/')} className="w-full">Home</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


