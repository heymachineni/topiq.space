import React from 'react';
import dynamic from 'next/dynamic';
import { GetStaticProps } from 'next';

// Import App with SSR enabled
const App = dynamic(() => import('../src/App'), { 
  ssr: true, // Enable server-side rendering to ensure proper build
  loading: () => <div className="h-screen w-screen bg-black flex items-center justify-center text-white">Loading...</div>
});

// Add getStaticProps to ensure the page gets built
export const getStaticProps: GetStaticProps = async () => {
  return {
    props: {},
    // Add revalidation to ensure the page is regenerated periodically
    revalidate: 3600, // Revalidate every hour
  };
};

export default function Home() {
  // Add a simple server-rendered wrapper
  return (
    <div className="app-container">
      <App />
    </div>
  );
} 