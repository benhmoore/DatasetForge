import React from 'react';
import { 
  StarIcon as StarOutlineIcon, 
  TrashIcon,  
  ChevronDownIcon, 
  ChevronUpIcon, 
  Cog6ToothIcon,
  PlusIcon,
  XMarkIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
  ArchiveBoxIcon,
  ArchiveBoxXMarkIcon,
  ArrowDownTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FolderPlusIcon,
  // Add new icon imports
  ArrowTopRightOnSquareIcon,
  DocumentTextIcon,
  CircleStackIcon,
  ClipboardDocumentIcon,
  DocumentDuplicateIcon,
  ArrowsRightLeftIcon,
  CodeBracketIcon,
  WrenchScrewdriverIcon,
  CheckIcon,
  ExclamationCircleIcon,
  DocumentPlusIcon,
  AdjustmentsHorizontalIcon,
  EllipsisVerticalIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';

const icons = {
  star: { outline: StarOutlineIcon, solid: StarSolidIcon },
  trash: { outline: TrashIcon },
  refresh: { outline: ArrowPathIcon },
  chevronDown: { outline: ChevronDownIcon },
  chevronUp: { outline: ChevronUpIcon },
  cog: { outline: Cog6ToothIcon },
  plus: { outline: PlusIcon },
  close: { outline: XMarkIcon },
  search: { outline: MagnifyingGlassIcon },
  spinner: { outline: ArrowPathIcon },
  user: { outline: UserCircleIcon },
  archive: { outline: ArchiveBoxIcon },
  unarchive: { outline: ArchiveBoxXMarkIcon },
  download: { outline: ArrowDownTrayIcon },
  chevronLeft: { outline: ChevronLeftIcon },
  chevronRight: { outline: ChevronRightIcon },
  folderPlus: { outline: FolderPlusIcon },
  // Add new icons
  externalLink: { outline: ArrowTopRightOnSquareIcon },
  document: { outline: DocumentTextIcon },
  database: { outline: CircleStackIcon },
  clipboard: { outline: ClipboardDocumentIcon },
  duplicate: { outline: DocumentDuplicateIcon },
  switch: { outline: ArrowsRightLeftIcon },
  code: { outline: CodeBracketIcon },
  tools: { outline: WrenchScrewdriverIcon },
  check: { outline: CheckIcon },
  warning: { outline: ExclamationCircleIcon },
  newDocument: { outline: DocumentPlusIcon },
  settings: { outline: AdjustmentsHorizontalIcon },
  more: { outline: EllipsisVerticalIcon },
  sparkles: { outline: SparklesIcon },
};

export default function Icon({ name, variant = 'outline', className = '', ...props }) {
  const IconComponent = icons[name] && (icons[name][variant] || icons[name].outline);
  if (!IconComponent) return null;
  return <IconComponent className={className} {...props} />;
}

