import RefactoredGenerate from './Generate/index';

// This is a wrapper component that preserves the original API
// while using the refactored implementation
const Generate = (props) => {
  return <RefactoredGenerate {...props} />;
};

export default Generate;