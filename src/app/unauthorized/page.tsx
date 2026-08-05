// src/app/unauthorized/page.tsx
import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
        <div className="text-6xl mb-4">🚫</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Pagină în construcție
        </h1>
        <p className="text-gray-600 mb-6">
          Această pagină va fi activată în viitor pentru restricții de rol.
        </p>
        <Link 
          href="/dashboard"
          className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Mergi la Dashboard
        </Link>
      </div>
    </div>
  );
}