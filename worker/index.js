export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Only accept POST requests to /remove-bg
    if (request.method !== 'POST' || url.pathname !== '/remove-bg') {
      return new Response('Not Found', { status: 404 });
    }

    try {
      const formData = await request.formData();
      const imageFile = formData.get('image_file');
      
      if (!imageFile) {
        return new Response(JSON.stringify({ error: 'No image file provided' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Forward to Remove.bg API
      const removeBgFormData = new FormData();
      removeBgFormData.append('image_file', imageFile);
      removeBgFormData.append('size', 'auto');
      removeBgFormData.append('format', 'png');

      const response = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: {
          'X-Api-Key': env.REMOVE_BG_API_KEY,
        },
        body: removeBgFormData,
      });

      if (!response.ok) {
        const error = await response.text();
        return new Response(JSON.stringify({ error }), {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Return the processed image
      const result = await response.arrayBuffer();
      return new Response(result, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
