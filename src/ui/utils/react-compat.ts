import * as ReactDOM from 'react-dom';
import React from 'react';

// Polyfill for React 18 createRoot in React 17 environment
export const createRoot = (container: Element) => {
  return {
    render: (element: React.ReactElement) => {
      ReactDOM.render(element, container);
    },
    unmount: () => {
      ReactDOM.unmountComponentAtNode(container);
    },
  };
};
